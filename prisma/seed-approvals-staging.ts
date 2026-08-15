import { PermissionLevel } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { createApprovalRequestFromAuthorization } from '../src/lib/approvals'

async function main() {
  const project = await prisma.project.findFirstOrThrow({ where: { slug: 'vhalam' }, select: { id: true } })
  const assignment = await prisma.employeeProjectAssignment.findFirstOrThrow({ where: { projectId: project.id, employee: { systemKey: 'chief-of-staff' } }, select: { id: true } })
  const tool = await prisma.projectTool.findFirstOrThrow({ where: { projectId: project.id, tool: { key: 'browser' } }, select: { id: true } })
  await prisma.employeeToolPermission.upsert({ where: { employeeProjectAssignmentId_projectToolId_capabilityKey: { employeeProjectAssignmentId: assignment.id, projectToolId: tool.id, capabilityKey: '*' } }, create: { projectId: project.id, employeeProjectAssignmentId: assignment.id, projectToolId: tool.id, level: PermissionLevel.EXECUTE_WITH_APPROVAL }, update: { level: PermissionLevel.EXECUTE_WITH_APPROVAL } })
  const existing = await prisma.approvalRequest.findFirst({ where: { projectId: project.id, projectToolId: tool.id, actionKey: 'execute', summary: 'Submit staging metadata form', status: 'PENDING' }, select: { id: true } })
  if (!existing) await createApprovalRequestFromAuthorization({ projectId: project.id, employeeProjectAssignmentId: assignment.id, projectToolId: tool.id, action: 'execute', summary: 'Submit staging metadata form', actionContext: { environment: 'staging', purpose: 'M10 visual verification', externalExecution: false } })
  console.log('M10_STAGING_FIXTURE_READY')
}
main().finally(() => prisma.$disconnect())
