import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PrismaClient, ProjectRole } from '@prisma/client'

import { dispatchTaskToHermes, getHermesExecution } from '../src/lib/hermes-runtime'
import type { HermesRuntimeAdapter } from '../src/lib/hermes-runtime-adapter'
import { canDispatchToHermes, canManageRuntimeAssignments } from '../src/lib/hermes-runtime-rules'

const prisma = new PrismaClient()
const suffix = `m11-${Date.now()}`
const timestamp = new Date().toISOString()

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code)
}

const completedAdapter: HermesRuntimeAdapter = {
  health: async () => ({ adapter: 'ok', hermesReachable: true, hermesVersion: 'test', runtimeIdentity: 'test', timestamp }),
  ensureProfile: async () => ({ status: 'READY' }),
  dispatchExecution: async ({ executionId }) => ({ externalExecutionId: `external-${executionId}`, status: 'SUCCEEDED', startedAt: timestamp, completedAt: timestamp, result: 'ROGEROS_HERMES_M11_OK test result' }),
  getExecutionStatus: async executionId => ({ externalExecutionId: executionId, status: 'SUCCEEDED', startedAt: timestamp, completedAt: timestamp, result: 'ROGEROS_HERMES_M11_OK test result' }),
}

test('M11 runtime preserves project isolation, default-deny roles, and execution lifecycle', async t => {
  const organization = await prisma.organization.create({ data: { name: 'M11 Test', slug: suffix } })
  const roles: ProjectRole[] = ['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER', 'VIEWER']
  const users = await Promise.all(roles.map(role => prisma.user.create({ data: { email: `${suffix}-${role.toLowerCase()}@example.invalid` } })))
  const members = await Promise.all(users.map((user, index) => prisma.organizationMember.create({ data: { userId: user.id, organizationId: organization.id, role: index === 0 ? 'OWNER' : 'VIEWER' } })))
  const [vhalam, buddhaji] = await Promise.all(['vhalam', 'buddhaji'].map(slug => prisma.project.create({ data: { organizationId: organization.id, name: `${slug}-${suffix}`, slug: `${slug}-${suffix}` } })))
  await Promise.all(members.map((member, index) => prisma.projectMember.create({ data: { projectId: vhalam.id, organizationId: organization.id, organizationMemberId: member.id, role: roles[index] } })))
  await prisma.projectMember.create({ data: { projectId: buddhaji.id, organizationId: organization.id, organizationMemberId: members[0].id, role: 'OWNER' } })
  const employee = await prisma.employee.create({ data: { systemKey: `chief-${suffix}`, name: 'Chief of Staff', role: 'Runtime test chief', type: 'SYSTEM' } })
  const [vhalamEmployee, buddhajiEmployee] = await Promise.all([
    prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: vhalam.id } }),
    prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: buddhaji.id } }),
  ])
  const runtime = await prisma.hermesRuntime.create({ data: { key: `runtime-${suffix}`, name: 'M11 test runtime', profileKey: 'rogeros-vhalam-chief-of-staff' } })
  const [vhalamRuntime, buddhajiRuntime] = await Promise.all([
    prisma.hermesRuntimeAssignment.create({ data: { projectId: vhalam.id, runtimeId: runtime.id, employeeProjectAssignmentId: vhalamEmployee.id, profileKey: 'rogeros-vhalam-chief-of-staff' } }),
    prisma.hermesRuntimeAssignment.create({ data: { projectId: buddhaji.id, runtimeId: runtime.id, employeeProjectAssignmentId: buddhajiEmployee.id, profileKey: 'rogeros-vhalam-chief-of-staff' } }),
  ])
  const task = await prisma.task.create({ data: { projectId: vhalam.id, title: 'M11 successful task', description: 'Return a safe test phrase', createdById: users[0].id, assignments: { create: { employeeProjectAssignmentId: vhalamEmployee.id } } } })
  const noRuntimeTask = await prisma.task.create({ data: { projectId: vhalam.id, title: 'M11 no runtime', createdById: users[0].id, assignments: { create: { employeeProjectAssignmentId: vhalamEmployee.id } } } })
  const duplicateTask = await prisma.task.create({ data: { projectId: vhalam.id, title: 'M11 duplicate guard', createdById: users[0].id, assignments: { create: { employeeProjectAssignmentId: vhalamEmployee.id } } } })
  const context = (index: number, project = vhalam) => ({ user: { id: users[index].id, email: users[index].email! }, organization: { id: organization.id, name: organization.name, slug: organization.slug, role: index === 0 ? 'OWNER' as const : 'VIEWER' as const }, project: { id: project.id, name: project.name, slug: project.slug, role: roles[index] } })

  t.after(async () => {
    await prisma.organization.delete({ where: { id: organization.id } })
    await prisma.hermesRuntime.delete({ where: { id: runtime.id } })
    await prisma.employee.delete({ where: { id: employee.id } })
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } })
    await prisma.$disconnect()
  })

  // The role matrices are pure and default-deny.
  assert.deepEqual(roles.map(canDispatchToHermes), [true, true, true, false, false])
  assert.deepEqual(roles.map(canManageRuntimeAssignments), [true, true, false, false, false])
  assert.notEqual(vhalamRuntime.id, buddhajiRuntime.id)
  assert.equal(await prisma.employeeToolPermission.findFirst({ where: { projectId: vhalam.id, employeeProjectAssignmentId: vhalamEmployee.id } }), null)

  // Anonymous/non-member and non-dispatch roles cannot enter the runtime.
  await assert.rejects(dispatchTaskToHermes({ ...context(0), user: { id: 'not-a-member', email: 'nobody@example.invalid' } }, task.id, completedAdapter), (error: unknown) => hasCode(error, 'FORBIDDEN'))
  await assert.rejects(dispatchTaskToHermes(context(3), task.id, completedAdapter), (error: unknown) => hasCode(error, 'FORBIDDEN'))
  await assert.rejects(dispatchTaskToHermes(context(4), task.id, completedAdapter), (error: unknown) => hasCode(error, 'FORBIDDEN'))

  // Operator may dispatch. Lifecycle and output persist without completing the Task itself.
  const execution = await dispatchTaskToHermes(context(2), task.id, completedAdapter)
  assert.equal(execution.status, 'SUCCEEDED')
  assert.match(execution.resultText ?? '', /ROGEROS_HERMES_M11_OK/)
  assert.ok(execution.externalExecutionId)
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).status, 'TODO')
  const activities = await prisma.taskActivity.findMany({ where: { projectId: vhalam.id, taskId: task.id } })
  assert.equal(activities.some(activity => activity.type === 'RUNTIME_QUEUED'), true)
  assert.equal(activities.some(activity => activity.type === 'RUNTIME_SUCCEEDED'), true)
  const audits = await prisma.auditEvent.findMany({ where: { projectId: vhalam.id, taskId: task.id } })
  assert.equal(audits.some(event => event.eventType === 'runtime.execution.queued'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.execution.succeeded'), true)
  assert.equal(JSON.stringify(audits).match(/token|secret|password|authorization/i), null)

  // Cross-project task and execution access remain non-leaking.
  await assert.rejects(dispatchTaskToHermes({ ...context(0), project: { ...context(0).project, id: buddhaji.id, name: buddhaji.name, slug: buddhaji.slug } }, task.id, completedAdapter), (error: unknown) => hasCode(error, 'TASK_NOT_FOUND'))
  await assert.rejects(getHermesExecution({ ...context(0), project: { ...context(0).project, id: buddhaji.id, name: buddhaji.name, slug: buddhaji.slug } }, execution.id), (error: unknown) => hasCode(error, 'EXECUTION_NOT_FOUND'))

  // An inactive/missing runtime is denied; a runtime assignment never substitutes for a tool permission.
  await prisma.hermesRuntimeAssignment.update({ where: { id: vhalamRuntime.id }, data: { active: false } })
  await assert.rejects(dispatchTaskToHermes(context(0), noRuntimeTask.id, completedAdapter), (error: unknown) => hasCode(error, 'RUNTIME_ASSIGNMENT_NOT_FOUND'))
  await prisma.hermesRuntimeAssignment.update({ where: { id: vhalamRuntime.id }, data: { active: true } })

  // A malformed response fails closed and emits a failure lifecycle; no task completion is fabricated.
  const malformed: HermesRuntimeAdapter = { ...completedAdapter, dispatchExecution: async () => ({ externalExecutionId: '', status: 'SUCCEEDED', startedAt: timestamp, completedAt: timestamp, result: 'unsafe' }) }
  await assert.rejects(dispatchTaskToHermes(context(0), noRuntimeTask.id, malformed), (error: unknown) => hasCode(error, 'ADAPTER_MALFORMED_RESPONSE'))
  const malformedExecution = await prisma.hermesExecution.findFirstOrThrow({ where: { projectId: vhalam.id, taskId: noRuntimeTask.id }, orderBy: { createdAt: 'desc' } })
  assert.equal(malformedExecution.status, 'FAILED')
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: noRuntimeTask.id } })).status, 'TODO')

  // Concurrent dispatch has one active winner due to the transaction advisory lock.
  const running: HermesRuntimeAdapter = { ...completedAdapter, dispatchExecution: async ({ executionId }) => ({ externalExecutionId: `running-${executionId}`, status: 'RUNNING', startedAt: timestamp, completedAt: null }), getExecutionStatus: async executionId => ({ externalExecutionId: executionId, status: 'RUNNING', startedAt: timestamp, completedAt: null }) }
  const results = await Promise.allSettled([dispatchTaskToHermes(context(0), duplicateTask.id, running), dispatchTaskToHermes(context(1), duplicateTask.id, running)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter(result => result.status === 'rejected').length, 1)
  const active = await prisma.hermesExecution.count({ where: { projectId: vhalam.id, taskId: duplicateTask.id, status: { in: ['QUEUED', 'DISPATCHING', 'RUNNING'] } } })
  assert.equal(active, 1)

  // Adapter secrets cannot be made client-visible by this server-only configuration.
  const adapterSource = await readFile(new URL('../src/lib/hermes-runtime-adapter.ts', import.meta.url), 'utf8')
  assert.equal(adapterSource.includes('NEXT_PUBLIC_'), false)
})
