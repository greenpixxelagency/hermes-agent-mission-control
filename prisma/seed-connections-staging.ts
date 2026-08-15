import { ConnectionStatus, PermissionLevel, ProjectToolStatus, PrismaClient } from '@prisma/client'
import { ensureBuiltInToolCatalog } from '../src/lib/tool-permissions'
const prisma = new PrismaClient()

async function main() {
  await ensureBuiltInToolCatalog()
  const project = await prisma.project.findFirstOrThrow({ where: { slug: 'vhalam', organization: { slug: 'green-pixxel' } } })
  const employee = await prisma.employee.findFirstOrThrow({ where: { systemKey: 'chief-of-staff' } })
  const assignment = await prisma.employeeProjectAssignment.findFirstOrThrow({ where: { projectId: project.id, employeeId: employee.id } })
  const toolDefinition = await prisma.toolDefinition.findUniqueOrThrow({ where: { key: 'reference_connector' } })
  const projectTool = await prisma.projectTool.upsert({ where: { projectId_toolDefinitionId: { projectId: project.id, toolDefinitionId: toolDefinition.id } }, create: { projectId: project.id, toolDefinitionId: toolDefinition.id, status: ProjectToolStatus.CONNECTED, displayName: 'Reference Connector' }, update: { status: ProjectToolStatus.CONNECTED } })
  await prisma.projectConnection.upsert({ where: { projectId_projectToolId: { projectId: project.id, projectToolId: projectTool.id } }, create: { projectId: project.id, projectToolId: projectTool.id, name: 'Vhalam staging reference connection', status: ConnectionStatus.CONNECTED, enabled: true, metadata: { kind: 'synthetic', environment: 'staging' } }, update: { status: ConnectionStatus.CONNECTED, enabled: true, metadata: { kind: 'synthetic', environment: 'staging' } } })
  await prisma.employeeToolPermission.upsert({ where: { employeeProjectAssignmentId_projectToolId_capabilityKey: { employeeProjectAssignmentId: assignment.id, projectToolId: projectTool.id, capabilityKey: '*' } }, create: { projectId: project.id, employeeProjectAssignmentId: assignment.id, projectToolId: projectTool.id, capabilityKey: '*', level: PermissionLevel.EXECUTE_WITH_APPROVAL }, update: { level: PermissionLevel.EXECUTE_WITH_APPROVAL } })
  await prisma.employeeToolPermission.upsert({ where: { employeeProjectAssignmentId_projectToolId_capabilityKey: { employeeProjectAssignmentId: assignment.id, projectToolId: projectTool.id, capabilityKey: 'reference_read' } }, create: { projectId: project.id, employeeProjectAssignmentId: assignment.id, projectToolId: projectTool.id, capabilityKey: 'reference_read', level: PermissionLevel.READ }, update: { level: PermissionLevel.READ } })
  console.log('M12_STAGING_CONNECTION_SEEDED=true')
}
main().finally(() => prisma.$disconnect())
