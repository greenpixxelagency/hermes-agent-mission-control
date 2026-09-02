import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { PrismaClient, ProjectRole } from '@prisma/client'

import { callbackSignature, MAX_CALLBACK_BODY_BYTES, parseHermesCompletion, readBoundedCallbackBody, verifyHermesCallback } from '../src/lib/hermes-callback'
import type { HermesExecutionRuntimeAdapter } from '../src/lib/hermes-runtime-adapter'
import {
  applyHermesCompletionCallback,
  canDispatchToHermes,
  canReviewHermesResult,
  dispatchTaskToHermes,
  getHermesExecution,
  refreshHermesExecution,
  retryHermesExecution,
  reviewHermesExecution,
} from '../src/lib/hermes-runtime'
import { botProfileId } from '../src/lib/hermes-bots'

const prisma = new PrismaClient()
const suffix = randomUUID().replaceAll('-', '')
const now = new Date().toISOString()

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code)
}

function completedAdapter(result = 'ROGEROS_M16_WORK_REVIEW_OK'): HermesExecutionRuntimeAdapter {
  return {
    health: async () => ({ adapter: 'ok', hermesReachable: true, hermesVersion: 'test', runtimeIdentity: 'test', timestamp: now }),
    ensureProfile: async () => ({ status: 'READY' }),
    dispatchExecution: async ({ executionId }) => ({ externalExecutionId: executionId, status: 'SUCCEEDED', startedAt: now, completedAt: now, result }),
    getExecutionStatus: async executionId => ({ externalExecutionId: executionId, status: 'SUCCEEDED', startedAt: now, completedAt: now, result }),
  }
}

function runningAdapter(): HermesExecutionRuntimeAdapter {
  return {
    ...completedAdapter(),
    dispatchExecution: async ({ executionId }) => ({ externalExecutionId: executionId, status: 'RUNNING', startedAt: now, completedAt: null }),
    getExecutionStatus: async executionId => ({ externalExecutionId: executionId, status: 'RUNNING', startedAt: now, completedAt: null }),
  }
}

test('M16 signed callback rejects forged, stale, malformed, and extra fields', () => {
  const secret = 'm16-test-secret-that-is-deliberately-longer-than-forty-eight-characters'
  const body = JSON.stringify({ externalExecutionId: 'exec-1', status: 'SUCCEEDED', startedAt: now, completedAt: now, result: 'ok' })
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = callbackSignature(secret, timestamp, body)
  assert.match(verifyHermesCallback({ secret, timestamp, signature, body }).fingerprint, /^[0-9a-f]{64}$/)
  assert.throws(() => verifyHermesCallback({ secret, timestamp, signature: '0'.repeat(64), body }), error => hasCode(error, 'CALLBACK_UNAUTHORIZED'))
  assert.throws(() => verifyHermesCallback({ secret, timestamp: String(Number(timestamp) - 301), signature, body }), error => hasCode(error, 'CALLBACK_EXPIRED'))
  assert.throws(() => parseHermesCompletion('{broken'), error => hasCode(error, 'CALLBACK_MALFORMED'))
  assert.throws(() => parseHermesCompletion(JSON.stringify({ ...JSON.parse(body), projectId: 'forged' })), error => hasCode(error, 'CALLBACK_MALFORMED'))
})

test('M16 callback body reader enforces the byte limit before buffering an oversized body', async () => {
  const accepted = 'x'.repeat(MAX_CALLBACK_BODY_BYTES)
  assert.equal(await readBoundedCallbackBody(new Request('https://preview.invalid/api/runtime/callback', { method: 'POST', body: accepted })), accepted)
  await assert.rejects(readBoundedCallbackBody(new Request('https://preview.invalid/api/runtime/callback', { method: 'POST', body: 'x'.repeat(MAX_CALLBACK_BODY_BYTES + 1) })), error => hasCode(error, 'CALLBACK_TOO_LARGE'))
  await assert.rejects(readBoundedCallbackBody(new Request('https://preview.invalid/api/runtime/callback', { method: 'POST', headers: { 'content-length': String(MAX_CALLBACK_BODY_BYTES + 1) }, body: '{}' })), error => hasCode(error, 'CALLBACK_TOO_LARGE'))
})

test('M16 makes AI work reviewable, retryable, idempotent, and project-isolated', async t => {
  const organization = await prisma.organization.create({ data: { name: 'M16 Test', slug: `m16-${suffix}` } })
  const roles: ProjectRole[] = ['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER', 'VIEWER']
  const users = await Promise.all(roles.map(role => prisma.user.create({ data: { email: `m16-${role.toLowerCase()}-${suffix}@example.invalid` } })))
  const orgMembers = await Promise.all(users.map((user, index) => prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: index === 0 ? 'OWNER' : 'VIEWER' } })))
  const [alpha, beta] = await Promise.all([
    prisma.project.create({ data: { organizationId: organization.id, name: 'Alpha', slug: `alpha-${suffix}` } }),
    prisma.project.create({ data: { organizationId: organization.id, name: 'Beta', slug: `beta-${suffix}` } }),
  ])
  await Promise.all(orgMembers.map((member, index) => prisma.projectMember.create({ data: { organizationId: organization.id, organizationMemberId: member.id, projectId: alpha.id, role: roles[index] } })))
  await prisma.projectMember.create({ data: { organizationId: organization.id, organizationMemberId: orgMembers[0].id, projectId: beta.id, role: 'OWNER' } })
  const employee = await prisma.employee.create({ data: { systemKey: `m16-chief-${suffix}`, name: 'AI Chief', role: 'AI operator', type: 'SYSTEM' } })
  const employeeAssignment = await prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: alpha.id } })
  const runtime = await prisma.hermesRuntime.create({ data: { key: `m16-runtime-${suffix}`, name: 'M16 Runtime' } })
  await prisma.hermesRuntimeAssignment.create({ data: { projectId: alpha.id, runtimeId: runtime.id, employeeProjectAssignmentId: employeeAssignment.id, profileKey: botProfileId(alpha.slug, employee.systemKey!) } })
  const context = (index: number, project = alpha) => ({
    user: { id: users[index].id, email: users[index].email! },
    organization: { id: organization.id, name: organization.name, slug: organization.slug, role: index === 0 ? 'OWNER' as const : 'VIEWER' as const },
    project: { id: project.id, name: project.name, slug: project.slug, role: roles[index] },
  })
  const makeTask = (title: string) => prisma.task.create({ data: { projectId: alpha.id, title, description: title, createdById: users[0].id, assignments: { create: { employeeProjectAssignmentId: employeeAssignment.id } } } })

  t.after(async () => {
    await prisma.organization.delete({ where: { id: organization.id } })
    await prisma.hermesRuntime.delete({ where: { id: runtime.id } })
    await prisma.employee.delete({ where: { id: employee.id } })
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } })
    await prisma.$disconnect()
  })

  assert.deepEqual(roles.map(canDispatchToHermes), [true, true, true, false, false])
  assert.deepEqual(roles.map(canReviewHermesResult), [true, true, false, true, false])

  const acceptedTask = await makeTask('Produce an acceptance result')
  const acceptedExecution = await dispatchTaskToHermes(context(2), acceptedTask.id, completedAdapter())
  assert.equal(acceptedExecution.reviewStatus, 'PENDING')
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: acceptedTask.id } })).status, 'REVIEW')
  await assert.rejects(reviewHermesExecution(context(2), acceptedExecution.id, 'ACCEPT'), error => hasCode(error, 'FORBIDDEN'))
  await reviewHermesExecution(context(3), acceptedExecution.id, 'ACCEPT', 'Verified result')
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: acceptedTask.id } })).status, 'DONE')
  assert.equal((await getHermesExecution(context(0), acceptedExecution.id)).reviewStatus, 'ACCEPTED')
  await assert.rejects(reviewHermesExecution(context(0), acceptedExecution.id, 'ACCEPT'), error => hasCode(error, 'REVIEW_NOT_ALLOWED'))

  const revisionTask = await makeTask('Draft and revise')
  const firstRevision = await dispatchTaskToHermes(context(0), revisionTask.id, completedAdapter('first result'))
  await reviewHermesExecution(context(1), firstRevision.id, 'REQUEST_REVISION', 'Make it clearer')
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: revisionTask.id } })).status, 'TODO')
  assert.equal((await prisma.hermesExecution.findUniqueOrThrow({ where: { id: firstRevision.id } })).resultText, 'first result')
  let revisedPrompt = ''
  const revisedAdapter: HermesExecutionRuntimeAdapter = { ...completedAdapter('revised result'), dispatchExecution: async input => { revisedPrompt = input.taskInstruction; return { externalExecutionId: input.executionId, status: 'SUCCEEDED', startedAt: now, completedAt: now, result: 'revised result' } } }
  const secondRevision = await dispatchTaskToHermes(context(0), revisionTask.id, revisedAdapter)
  assert.match(revisedPrompt, /Make it clearer/)
  assert.notEqual(firstRevision.id, secondRevision.id)

  const failedTask = await makeTask('Fail safely')
  const failedAdapter: HermesExecutionRuntimeAdapter = { ...completedAdapter(), dispatchExecution: async ({ executionId }) => ({ externalExecutionId: executionId, status: 'FAILED', startedAt: now, completedAt: now, error: 'sensitive upstream detail' }) }
  const failed = await dispatchTaskToHermes(context(1), failedTask.id, failedAdapter)
  assert.equal(failed.status, 'FAILED')
  assert.equal(failed.errorMessage, 'RUNTIME_EXECUTION_FAILED')
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: failedTask.id } })).status, 'BLOCKED')
  const retried = await retryHermesExecution(context(2), failed.id, completedAdapter('retry succeeded'))
  assert.equal(retried.status, 'SUCCEEDED')
  assert.equal((await prisma.hermesExecution.count({ where: { taskId: failedTask.id } })), 2)

  const callbackTask = await makeTask('Complete by callback')
  const callbackExecution = await dispatchTaskToHermes(context(0), callbackTask.id, runningAdapter())
  await assert.rejects(refreshHermesExecution(context(4), callbackExecution.id, completedAdapter('viewer must not reconcile')), error => hasCode(error, 'FORBIDDEN'))
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: callbackTask.id } })).status, 'IN_PROGRESS')
  const callbackBody = JSON.stringify({ externalExecutionId: callbackExecution.externalExecutionId, status: 'SUCCEEDED', startedAt: now, completedAt: now, result: 'callback result' })
  const evidence = { fingerprint: callbackSignature('fingerprint-only-test-secret', '0000000000', callbackBody), receivedAt: new Date() }
  await applyHermesCompletionCallback(JSON.parse(callbackBody), evidence)
  const activityCount = await prisma.taskActivity.count({ where: { taskId: callbackTask.id } })
  await applyHermesCompletionCallback(JSON.parse(callbackBody), evidence)
  assert.equal(await prisma.taskActivity.count({ where: { taskId: callbackTask.id } }), activityCount)
  await assert.rejects(applyHermesCompletionCallback(JSON.parse(callbackBody), { ...evidence, fingerprint: 'different' }), error => hasCode(error, 'CALLBACK_CONFLICT'))
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: callbackTask.id } })).status, 'REVIEW')

  const synchronizedTask = await makeTask('Complete before callback arrives')
  const synchronized = await dispatchTaskToHermes(context(0), synchronizedTask.id, completedAdapter('synchronized result'))
  const synchronizedBody = { externalExecutionId: synchronized.externalExecutionId!, status: 'SUCCEEDED' as const, startedAt: now, completedAt: now, result: 'synchronized result' }
  await applyHermesCompletionCallback(synchronizedBody, { fingerprint: 'matching-after-sync', receivedAt: new Date() })
  assert.equal((await prisma.hermesExecution.findUniqueOrThrow({ where: { id: synchronized.id } })).callbackFingerprint, 'matching-after-sync')
  await assert.rejects(applyHermesCompletionCallback({ ...synchronizedBody, result: 'changed result' }, { fingerprint: 'changed-after-sync', receivedAt: new Date() }), error => hasCode(error, 'CALLBACK_CONFLICT'))

  const duplicateTask = await makeTask('Prevent duplicate work')
  const duplicateResults = await Promise.allSettled([dispatchTaskToHermes(context(0), duplicateTask.id, runningAdapter()), dispatchTaskToHermes(context(1), duplicateTask.id, runningAdapter())])
  assert.equal(duplicateResults.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(duplicateResults.filter(result => result.status === 'rejected').length, 1)

  await assert.rejects(getHermesExecution({ ...context(0, beta), project: { ...context(0, beta).project, role: 'OWNER' } }, acceptedExecution.id), error => hasCode(error, 'EXECUTION_NOT_FOUND'))
  await assert.rejects(reviewHermesExecution({ ...context(0, beta), project: { ...context(0, beta).project, role: 'OWNER' } }, acceptedExecution.id, 'ACCEPT'), error => hasCode(error, 'EXECUTION_NOT_FOUND'))

  const oversizedTask = await makeTask('Reject oversized output')
  await assert.rejects(dispatchTaskToHermes(context(0), oversizedTask.id, completedAdapter('x'.repeat(20_001))), error => hasCode(error, 'ADAPTER_RESULT_TOO_LARGE'))
  assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: oversizedTask.id } })).status, 'BLOCKED')

  const audits = await prisma.auditEvent.findMany({ where: { projectId: alpha.id } })
  assert.equal(audits.some(event => event.eventType === 'task.review.ready'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.execution.revision_requested'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.execution.retry_requested'), true)
  assert.equal(JSON.stringify(audits).match(/sensitive upstream detail/i), null)
})
