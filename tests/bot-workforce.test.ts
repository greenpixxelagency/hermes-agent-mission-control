import test from 'node:test'
import assert from 'node:assert/strict'
import { OrganizationRole, PrismaClient, ProjectRole } from '@prisma/client'

import {
  botProfileId,
  compileHermesSoul,
  normalizeHermesRuntimeObservation,
  reconcileHermesBotAssignment,
  runtimeSlug,
  sendHermesBotMessage,
  setHermesBotSuspension,
} from '../src/lib/hermes-bots'
import type {
  HermesBot,
  HermesBotIdentitySpec,
  HermesRuntimeAdapter,
} from '../src/lib/hermes-runtime-adapter'
import { normalizeHermesBotMessageResult, safeAdapterErrorHint } from '../src/lib/hermes-runtime-adapter'

const prisma = new PrismaClient()
const suffix = `m14b-${Date.now()}`
const timestamp = new Date().toISOString()

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === code)
}

function adapterHarness() {
  let bot: HermesBot | null = null
  let state: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE'
  let ensureCount = 0
  const profiles: string[] = []
  const adapter: HermesRuntimeAdapter = {
    health: async () => ({ adapter: 'm14b-test', hermesReachable: true, hermesVersion: '0.20.5', runtimeIdentity: 'isolated-test', timestamp }),
    ensureProfile: async () => ({ status: 'READY' }),
    dispatchExecution: async ({ executionId }) => ({ externalExecutionId: executionId, status: 'SUCCEEDED', startedAt: timestamp, completedAt: timestamp, result: 'ROGEROS_M14B_TASK_OK' }),
    getExecutionStatus: async externalExecutionId => ({ externalExecutionId, status: 'SUCCEEDED', startedAt: timestamp, completedAt: timestamp, result: 'ROGEROS_M14B_TASK_OK' }),
    listBots: async () => bot ? [bot] : [],
    getBot: async profileId => ({ ...(bot ?? { profileId, displayName: profileId }), state }),
    getBotRuntimeStatus: async profileId => ({ profileId, state, healthy: true, hermesVersion: '0.20.5', botModeAvailable: true, botChatAvailable: true, skillsAvailable: true, routinesAvailable: true }),
    listBotSkills: async () => [{ key: 'read-only', name: 'Read only', bundled: true }],
    listBotRoutines: async () => [],
    listBotSessions: async () => [],
    getBotCapabilityFingerprint: async () => ({ fingerprint: 'm14b-safe-capability-fingerprint', skillCount: 1, botChatAvailable: true, routinesAvailable: true }),
    ensureBot: async (spec: HermesBotIdentitySpec) => {
      ensureCount += 1
      profiles.push(spec.profileId)
      bot = { profileId: spec.profileId, displayName: spec.profileId, state }
      return bot
    },
    updateBotIdentity: async (profileId, metadata) => ({ ...(bot ?? { profileId, state }), ...metadata, profileId, state }),
    updateBotSoul: async profileId => ({ ...(bot ?? { profileId, displayName: profileId, state }), profileId, state }),
    updateBotRuntimeConfig: async (profileId, config) => ({ ...(bot ?? { profileId, displayName: profileId, state }), profileId, state, modelProvider: config.provider, modelId: config.modelId }),
    provisionBotSkill: async (_profileId, skillId) => ({ skillId, provisioned: true }),
    reconcileBotSkills: async () => [],
    suspendBotAssignment: async profileId => { state = 'SUSPENDED'; return { profileId, state } },
    resumeBotAssignment: async profileId => { state = 'ACTIVE'; return { profileId, state } },
    sendBotMessage: async (profileId, _message, correlationId) => ({ profileId, correlationId, result: 'ROGEROS_M14B_BOT_CHAT_OK', sessionId: 'safe-session', completedAt: timestamp }),
  }
  return { adapter, ensureCount: () => ensureCount, profiles }
}

test('M14B normalizes truthful runtime observations from status and health', () => {
  const healthy = normalizeHermesRuntimeObservation({ status: { assignmentState: 'ACTIVE' }, health: { hermesReachable: true, hermesVersion: 'v0.20.5' }, capability: {} })
  assert.equal(healthy.runtimeStatus, 'HEALTHY')
  assert.equal(healthy.observedHermesVersion, 'v0.20.5')
  assert.equal(healthy.botChatAvailable, true)
  const degradedOptional = normalizeHermesRuntimeObservation({ status: { state: 'ACTIVE' }, health: { hermesReachable: true, hermesVersion: 'v0.20.5' }, capability: { botChatAvailable: false } })
  assert.equal(degradedOptional.runtimeStatus, 'HEALTHY')
  assert.equal(degradedOptional.botChatAvailable, false)
  const unavailable = normalizeHermesRuntimeObservation({ status: { assignmentState: 'ACTIVE' }, health: { hermesReachable: false }, capability: {} })
  assert.equal(unavailable.runtimeStatus, 'UNHEALTHY')
  const suspended = normalizeHermesRuntimeObservation({ status: { assignmentState: 'SUSPENDED' }, health: { hermesReachable: true, hermesVersion: 'v0.20.5' }, capability: {} })
  assert.equal(suspended.runtimeStatus, 'SUSPENDED')
})

test('M14B normalizes the deployed Bot Chat output envelope', () => {
  const normalized = normalizeHermesBotMessageResult({ profileId: 'rogeros-vhalam-chief', correlationId: 'safe-correlation', output: 'ROGEROS_M14B_BOT_CHAT_OK' })
  assert.equal(normalized.result, 'ROGEROS_M14B_BOT_CHAT_OK')
  assert.equal(normalized.profileId, 'rogeros-vhalam-chief')
  assert.equal(normalized.correlationId, 'safe-correlation')
  const cliOutput = normalizeHermesBotMessageResult({ profileId: 'rogeros-vhalam-chief', correlationId: 'safe-correlation', output: '┌─ Reasoning ─────┐\nInternal model reasoning.\n\nROGEROS_M14B_BOT_CHAT_OK' })
  assert.equal(cliOutput.result, 'ROGEROS_M14B_BOT_CHAT_OK')
})

test('M14B provisions deterministic project-scoped bots and enforces runtime authorization', async t => {
  const organization = await prisma.organization.create({ data: { name: 'M14B Test', slug: suffix } })
  const roles: ProjectRole[] = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER']
  const organizationRoles: OrganizationRole[] = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER']
  const users = await Promise.all(roles.map(role => prisma.user.create({ data: { email: `${suffix}-${role.toLowerCase()}@example.invalid` } })))
  const members = await Promise.all(users.map((user, index) => prisma.organizationMember.create({ data: { userId: user.id, organizationId: organization.id, role: organizationRoles[index] } })))
  const [vhalam, buddhaji] = await Promise.all(['vhalam', 'buddhaji'].map(slug => prisma.project.create({ data: { organizationId: organization.id, name: `${slug}-${suffix}`, slug: `${slug}-${suffix}` } })))
  await Promise.all(members.map((member, index) => prisma.projectMember.create({ data: { projectId: vhalam.id, organizationId: organization.id, organizationMemberId: member.id, role: roles[index] } })))
  await prisma.projectMember.create({ data: { projectId: buddhaji.id, organizationId: organization.id, organizationMemberId: members[0].id, role: 'OWNER' } })
  const employee = await prisma.employee.create({ data: { systemKey: `chief-${suffix}`, name: 'Chief of Staff', role: 'Chief of Staff', type: 'SYSTEM', description: 'Coordinates approved project work.' } })
  const [vhalamEmployee, buddhajiEmployee] = await Promise.all([
    prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: vhalam.id } }),
    prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: buddhaji.id } }),
  ])
  const runtime = await prisma.hermesRuntime.create({ data: { key: `runtime-${suffix}`, name: 'M14B isolated runtime' } })
  const vhalamProfile = botProfileId(vhalam.slug, employee.systemKey!)
  const buddhajiProfile = botProfileId(buddhaji.slug, employee.systemKey!)
  const [vhalamRuntime] = await Promise.all([
    prisma.hermesRuntimeAssignment.create({ data: { projectId: vhalam.id, runtimeId: runtime.id, employeeProjectAssignmentId: vhalamEmployee.id, profileKey: vhalamProfile } }),
    prisma.hermesRuntimeAssignment.create({ data: { projectId: buddhaji.id, runtimeId: runtime.id, employeeProjectAssignmentId: buddhajiEmployee.id, profileKey: buddhajiProfile } }),
  ])
  const context = (index: number, project = vhalam) => ({
    user: { id: users[index].id, email: users[index].email! },
    organization: { id: organization.id, name: organization.name, slug: organization.slug, role: organizationRoles[index] },
    project: { id: project.id, name: project.name, slug: project.slug, role: project.id === vhalam.id ? roles[index] : 'OWNER' as const },
  })
  const harness = adapterHarness()

  t.after(async () => {
    await prisma.organization.delete({ where: { id: organization.id } })
    await prisma.hermesRuntime.delete({ where: { id: runtime.id } })
    await prisma.employee.delete({ where: { id: employee.id } })
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } })
    await prisma.$disconnect()
  })

  assert.equal(runtimeSlug(' ../Chief of Staff '), 'chief-of-staff')
  const soul = compileHermesSoul({ employee: { name: 'Chief of Staff', role: 'Chief of Staff', description: 'Coordinates approved project work.', soulSummary: null }, assignment: { roleOverride: null }, project: { name: 'Vhalam', slug: 'vhalam' } })
  assert.equal(soul.content.startsWith('# SOUL\n'), true)
  assert.equal(/oauth|bearer|password|api[_ -]?key|credential|token|secret/i.test(soul.content), false)
  assert.equal(vhalamProfile.startsWith(`rogeros-${vhalam.slug}-`), true)
  assert.notEqual(vhalamProfile, buddhajiProfile)
  assert.equal(safeAdapterErrorHint({ code: 'MISSING_FIELD', field: 'projectKey', message: 'must not be exposed' }), 'MISSING_FIELD_projectKey')
  assert.equal(safeAdapterErrorHint({ error: 'UNKNOWN_FIELD', unknownFields: ['runtimeProfileKey'], token: 'secret-value' }), 'UNKNOWN_FIELD_runtimeProfileKey')
  assert.equal(safeAdapterErrorHint({ error: 'UNKNOWN_FIELD', details: 'Unknown field: description', message: 'secret-value' }), 'UNKNOWN_FIELD_description')

  await assert.rejects(reconcileHermesBotAssignment(context(2), vhalamEmployee.id, harness.adapter), error => hasCode(error, 'FORBIDDEN'))
  await assert.rejects(reconcileHermesBotAssignment(context(3), vhalamEmployee.id, harness.adapter), error => hasCode(error, 'FORBIDDEN'))
  const reconciled = await reconcileHermesBotAssignment(context(0), vhalamEmployee.id, harness.adapter)
  assert.equal(reconciled.runtimeKind, 'HERMES_BOT')
  assert.equal(reconciled.provisioningState, 'READY')
  assert.equal(reconciled.reconciliationState, 'IN_SYNC')
  assert.equal(reconciled.profileKey, vhalamProfile)
  assert.equal(reconciled.capabilityFingerprint, 'm14b-safe-capability-fingerprint')
  await reconcileHermesBotAssignment(context(1), vhalamEmployee.id, harness.adapter)
  assert.equal(harness.ensureCount(), 1)
  assert.deepEqual(harness.profiles, [vhalamProfile])

  await assert.rejects(sendHermesBotMessage(context(3), vhalamEmployee.id, 'denied', harness.adapter), error => hasCode(error, 'FORBIDDEN'))
  const chat = await sendHermesBotMessage(context(2), vhalamEmployee.id, 'Return the verification phrase.', harness.adapter)
  assert.equal(chat.result, 'ROGEROS_M14B_BOT_CHAT_OK')
  const messages = await prisma.message.findMany({ where: { projectId: vhalam.id, conversationId: chat.conversationId }, orderBy: { createdAt: 'asc' } })
  assert.equal(messages.length, 2)
  assert.equal(messages[0].authorUserId, users[2].id)
  assert.equal(messages[1].authorSystemIdentity, `hermes:${vhalamProfile}`)
  assert.equal(JSON.stringify(messages).match(/authorization|bearer|password|token/i), null)

  await assert.rejects(sendHermesBotMessage(context(0, buddhaji), vhalamEmployee.id, 'cross-project', harness.adapter), error => hasCode(error, 'RUNTIME_ASSIGNMENT_NOT_FOUND'))
  await setHermesBotSuspension(context(0), vhalamEmployee.id, 'suspend', harness.adapter)
  await assert.rejects(sendHermesBotMessage(context(2), vhalamEmployee.id, 'suspended', harness.adapter), error => hasCode(error, 'RUNTIME_SUSPENDED'))
  await assert.rejects(setHermesBotSuspension(context(2), vhalamEmployee.id, 'resume', harness.adapter), error => hasCode(error, 'FORBIDDEN'))
  await setHermesBotSuspension(context(1), vhalamEmployee.id, 'resume', harness.adapter)
  assert.equal((await prisma.hermesRuntimeAssignment.findUniqueOrThrow({ where: { id: vhalamRuntime.id } })).assignmentState, 'ACTIVE')

  await prisma.hermesRuntimeAssignment.update({ where: { id: vhalamRuntime.id }, data: { profileKey: 'rogeros-buddhaji-forged' } })
  await assert.rejects(reconcileHermesBotAssignment(context(0), vhalamEmployee.id, harness.adapter), error => hasCode(error, 'INVALID_RUNTIME_IDENTITY'))
  const audits = await prisma.auditEvent.findMany({ where: { projectId: vhalam.id, targetId: vhalamRuntime.id } })
  assert.equal(audits.some(event => event.eventType === 'runtime.bot.ensured'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.bot.identity.updated'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.bot.soul.updated'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.bot.capability.refreshed'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.bot.reconciled'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.bot.chat.succeeded'), true)
  assert.equal(audits.some(event => event.eventType === 'runtime.bot.suspended'), true)
  assert.equal(JSON.stringify(audits).match(/authorization|bearer|password|token/i), null)
})
