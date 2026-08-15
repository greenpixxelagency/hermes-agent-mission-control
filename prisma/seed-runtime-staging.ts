import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const instruction = 'Return the exact phrase ROGEROS_HERMES_M11_OK and then provide one sentence confirming this was a safe RogerOS staging runtime integration test. Do not use external tools.'

async function main() {
  const project = await prisma.project.findFirstOrThrow({ where: { slug: 'vhalam', organization: { slug: 'green-pixxel' } } })
  const owner = await prisma.projectMember.findFirstOrThrow({ where: { projectId: project.id, role: 'OWNER' }, include: { organizationMember: true } })
  const employee = await prisma.employee.upsert({
    where: { systemKey: 'chief-of-staff' },
    create: { systemKey: 'chief-of-staff', name: 'Chief of Staff', role: 'Chief of Staff', type: 'SYSTEM', description: 'Coordinates work across the RogerOS workforce.' },
    update: { name: 'Chief of Staff', role: 'Chief of Staff', type: 'SYSTEM' },
  })
  const employeeAssignment = await prisma.employeeProjectAssignment.upsert({
    where: { employeeId_projectId: { employeeId: employee.id, projectId: project.id } },
    create: { employeeId: employee.id, projectId: project.id },
    update: { status: 'ACTIVE', pausedAt: null },
  })
  const runtime = await prisma.hermesRuntime.upsert({
    where: { key: 'rogeros-hermes-staging' },
    create: { key: 'rogeros-hermes-staging', name: 'RogerOS Hermes Staging', status: 'ACTIVE', profileKey: 'rogeros-vhalam-chief-of-staff' },
    update: { name: 'RogerOS Hermes Staging', status: 'ACTIVE', profileKey: 'rogeros-vhalam-chief-of-staff' },
  })
  await prisma.hermesRuntimeAssignment.upsert({
    where: { projectId_runtimeId: { projectId: project.id, runtimeId: runtime.id } },
    create: { projectId: project.id, runtimeId: runtime.id, employeeProjectAssignmentId: employeeAssignment.id, profileKey: 'rogeros-vhalam-chief-of-staff', active: true },
    update: { employeeProjectAssignmentId: employeeAssignment.id, profileKey: 'rogeros-vhalam-chief-of-staff', active: true },
  })
  const task = await prisma.task.findFirst({ where: { projectId: project.id, title: 'M11 Hermes runtime integration verification' } })
  const savedTask = task
    ? await prisma.task.update({ where: { id: task.id }, data: { description: instruction, status: 'TODO', completedAt: null, resultSummary: null } })
    : await prisma.task.create({ data: { projectId: project.id, title: 'M11 Hermes runtime integration verification', description: instruction, createdById: owner.organizationMember.userId } })
  await prisma.taskAssignment.upsert({
    where: { taskId_employeeProjectAssignmentId: { taskId: savedTask.id, employeeProjectAssignmentId: employeeAssignment.id } },
    create: { projectId: project.id, taskId: savedTask.id, employeeProjectAssignmentId: employeeAssignment.id },
    update: {},
  })
  console.log('M11_STAGING_RUNTIME_SEEDED=true')
}

main().finally(() => prisma.$disconnect())
