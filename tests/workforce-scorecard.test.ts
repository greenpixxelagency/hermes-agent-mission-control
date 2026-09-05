import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { PrismaClient, ProjectRole } from '@prisma/client'

import { canReadWorkforceScorecard, getWorkforceScorecard, parseScorecardRange } from '../src/lib/workforce-scorecard'

const prisma = new PrismaClient()
const suffix = randomUUID().replaceAll('-', '')

function context(user: { id: string; email: string }, organization: { id: string; name: string; slug: string }, project: { id: string; name: string; slug: string }, role: ProjectRole) {
  return { user, organization: { ...organization, role: 'ADMIN' as const }, project: { ...project, role } }
}

test('M20 computes bounded project evidence without costs, payloads, or cross-project facts', async t => {
  const organization = await prisma.organization.create({ data: { name: 'M20 Test', slug: `m20-${suffix}` } })
  const owner = await prisma.user.create({ data: { email: `m20-owner-${suffix}@example.invalid` } })
  const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: owner.id, role: 'ADMIN' } })
  const [alpha, beta] = await Promise.all(['alpha', 'beta'].map(slug => prisma.project.create({ data: { organizationId: organization.id, name: `${slug}-${suffix}`, slug: `${slug}-${suffix}` } })))
  await Promise.all([prisma.projectMember.create({ data: { organizationId: organization.id, organizationMemberId: member.id, projectId: alpha.id, role: 'OWNER' } }), prisma.projectMember.create({ data: { organizationId: organization.id, organizationMemberId: member.id, projectId: beta.id, role: 'OWNER' } })])
  const employee = await prisma.employee.create({ data: { name: 'Evidence Worker', role: 'Operations' } })
  const assignment = await prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: alpha.id } })
  const runtime = await prisma.hermesRuntime.create({ data: { key: `m20-runtime-${suffix}`, name: 'M20 Runtime' } })
  const runtimeAssignment = await prisma.hermesRuntimeAssignment.create({ data: { projectId: alpha.id, runtimeId: runtime.id, employeeProjectAssignmentId: assignment.id, profileKey: `m20-${suffix}` } })
  const now = new Date()
  const task = await prisma.task.create({ data: { projectId: alpha.id, title: 'Accepted work', createdById: owner.id, status: 'DONE', completedAt: now, assignments: { create: { employeeProjectAssignmentId: assignment.id } } } })
  await prisma.hermesExecution.create({ data: { projectId: alpha.id, taskId: task.id, runtimeId: runtime.id, runtimeAssignmentId: runtimeAssignment.id, status: 'SUCCEEDED', prompt: 'private prompt must not leave the scorecard', resultText: 'private result must not leave the scorecard', reviewStatus: 'ACCEPTED', completedAt: now, reviewedAt: now } })
  const tool = await prisma.toolDefinition.create({ data: { key: `m20-tool-${suffix}`, name: 'M20 Tool', category: 'TEST' } })
  const projectTool = await prisma.projectTool.create({ data: { projectId: alpha.id, toolDefinitionId: tool.id } })
  const connection = await prisma.projectConnection.create({ data: { projectId: alpha.id, projectToolId: projectTool.id, name: 'M20 connection' } })
  await prisma.toolExecution.create({ data: { projectId: alpha.id, employeeProjectAssignmentId: assignment.id, projectToolId: projectTool.id, projectConnectionId: connection.id, capabilityKey: 'read', actionKey: 'read', requestFingerprint: `m20-${suffix}`, status: 'SUCCEEDED', requestMetadata: { prompt: 'private provider request' }, resultMetadata: { output: 'private provider output' }, resultText: 'private output', completedAt: now } })

  t.after(async () => { await prisma.organization.delete({ where: { id: organization.id } }); await prisma.hermesRuntime.delete({ where: { id: runtime.id } }); await prisma.employee.delete({ where: { id: employee.id } }); await prisma.toolDefinition.delete({ where: { id: tool.id } }); await prisma.user.delete({ where: { id: owner.id } }); await prisma.$disconnect() })

  assert.deepEqual((['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER', 'VIEWER'] as ProjectRole[]).map(canReadWorkforceScorecard), [true, true, true, true, false])
  const rangeEnd = new Date()
  const range = parseScorecardRange({ start: new Date(now.getTime() - 60_000).toISOString(), end: rangeEnd.toISOString() }, new Date(rangeEnd.getTime() + 1))
  const scorecard = await getWorkforceScorecard(context(owner as { id: string; email: string }, organization, alpha, 'OWNER'), range)
  assert.equal(scorecard.workers.length, 1)
  assert.deepEqual(scorecard.workers[0].assignedWork, { assignedInRange: 1, completedInRange: 1 })
  assert.deepEqual(scorecard.workers[0].runtimeAttempts, { createdInRange: 1, succeededInRange: 1, acceptedInRange: 1 })
  assert.deepEqual(scorecard.workers[0].governedToolExecutions, { createdInRange: 1, succeededInRange: 1, failedInRange: 0 })
  assert.equal(scorecard.workers[0].evidence.runtimeExecutions[0].id.length > 0, true)
  assert.equal('resultText' in scorecard.workers[0].evidence.runtimeExecutions[0], false)
  assert.deepEqual(scorecard.workers[0].cost, { actualAmount: null, currency: null, availability: 'UNKNOWN', reason: 'NO_PROVIDER_USAGE_RECORD' })
  assert.equal(JSON.stringify(scorecard).match(/private prompt|private result|private output/i), null)
  assert.equal((await getWorkforceScorecard(context(owner as { id: string; email: string }, organization, beta, 'OWNER'), range)).workers.length, 0)
  await assert.rejects(getWorkforceScorecard(context(owner as { id: string; email: string }, organization, alpha, 'VIEWER'), range), error => Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'FORBIDDEN'))
  assert.throws(() => parseScorecardRange({ start: new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString(), end: now.toISOString() }), /INVALID_RANGE/)
})
