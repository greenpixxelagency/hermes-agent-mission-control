import { createHash, randomUUID } from 'node:crypto'
import { AuditActorType, HermesRuntimeAssignmentState, HermesRuntimeKind, ProjectRole } from '@prisma/client'

import { recordAuditEvent, safeMetadata } from '@/lib/audit'
import { hermesRuntimeAdapter, type HermesBotSpec, type HermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

const operateRoles = new Set<ProjectRole>(['OWNER', 'ADMIN', 'OPERATOR'])
const administerRoles = new Set<ProjectRole>(['OWNER', 'ADMIN'])
const systemIdentity = (profileId: string) => `hermes:${profileId}`

export class HermesBotError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'HermesBotError' }
}

export function runtimeSlug(value: string) {
  const slug = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '')
  if (!slug || slug.includes('..')) throw new HermesBotError('INVALID_RUNTIME_IDENTITY')
  return slug
}

export function botProfileId(projectSlug: string, employeeIdentity: string) {
  return `rogeros-${runtimeSlug(projectSlug)}-${runtimeSlug(employeeIdentity)}`
}

function approvedRuntimeConfig() {
  return {
    provider: process.env.HERMES_STAGING_APPROVED_MODEL_PROVIDER || 'adapter-managed',
    modelId: process.env.HERMES_STAGING_APPROVED_MODEL_ID || 'existing-safe-default',
    explicitlyConfigured: Boolean(process.env.HERMES_STAGING_APPROVED_MODEL_PROVIDER && process.env.HERMES_STAGING_APPROVED_MODEL_ID),
  }
}

export function compileHermesSoul(input: { employee: { name: string; role: string; description: string | null; soulSummary: string | null }; assignment: { roleOverride: string | null }; project: { name: string; slug: string } }) {
  const role = input.assignment.roleOverride || input.employee.role
  const content = [
    '# SOUL',
    '',
    '## Identity',
    `Name: ${input.employee.name}`,
    `Role: ${role}`,
    `Project: ${input.project.name}`,
    '',
    '## Mission',
    input.employee.description || input.employee.soulSummary || `Focus on the responsibilities of ${role}.`,
    '',
    '## Operating principles',
    '- Work only within the project context supplied by RogerOS.',
    '- Treat RogerOS permissions, policies, approvals, and business records as authoritative.',
    '- Escalate uncertainty and consequential actions to the authorized RogerOS operator.',
  ].join('\n')
  return { content, hash: createHash('sha256').update(content).digest('hex') }
}

type LoadedAssignment = Awaited<ReturnType<typeof loadAssignment>>
async function loadAssignment(projectId: string, employeeProjectAssignmentId: string) {
  const assignment = await prisma.employeeProjectAssignment.findFirst({
    where: { id: employeeProjectAssignmentId, projectId },
    include: { employee: true, project: true, runtimeAssignments: { include: { runtime: true } } },
  })
  if (!assignment) throw new HermesBotError('RUNTIME_ASSIGNMENT_NOT_FOUND')
  const runtimeAssignment = assignment.runtimeAssignments[0]
  if (!runtimeAssignment || runtimeAssignment.runtime.status !== 'ACTIVE') throw new HermesBotError('RUNTIME_ASSIGNMENT_NOT_FOUND')
  return { assignment, runtimeAssignment }
}

function expectedProfile(loaded: LoadedAssignment) {
  return botProfileId(loaded.assignment.project.slug, loaded.assignment.employee.systemKey || loaded.assignment.employee.name)
}

export function compileHermesBotDesiredState(loaded: LoadedAssignment): HermesBotSpec {
  const profileId = expectedProfile(loaded)
  if (loaded.runtimeAssignment.profileKey !== profileId) throw new HermesBotError('INVALID_RUNTIME_IDENTITY')
  const projectedSoul = compileHermesSoul({ employee: loaded.assignment.employee, assignment: loaded.assignment, project: loaded.assignment.project })
  const model = approvedRuntimeConfig()
  return {
    profileId,
    projectKey: `rogeros-${runtimeSlug(loaded.assignment.project.slug)}`,
    employeeKey: runtimeSlug(loaded.assignment.employee.systemKey || loaded.assignment.employee.name),
    displayName: `RogerOS ${loaded.assignment.project.name} ${loaded.assignment.employee.name}`,
    description: loaded.assignment.employee.description || `${loaded.assignment.employee.role} assigned to ${loaded.assignment.project.name}`,
    soul: { revision: loaded.runtimeAssignment.desiredSoulRevision, hash: projectedSoul.hash, content: projectedSoul.content },
    runtime: { provider: model.provider, modelId: model.modelId },
    approvedSkills: [],
  }
}

async function actor(context: ProjectContext) {
  const member = await prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } })
  if (!member) throw new HermesBotError('FORBIDDEN')
  return member
}

async function audit(context: ProjectContext, memberId: string, eventType: string, assignmentId: string, summary: string, metadata?: unknown) {
  return recordAuditEvent({ projectId: context.project.id, eventType, actor: { type: AuditActorType.HUMAN, projectMemberId: memberId }, targetType: 'HermesRuntimeAssignment', targetId: assignmentId, summary, metadata })
}

function validateProfile(actual: string, expected: string) {
  if (!actual || actual !== expected) throw new HermesBotError('ADAPTER_MALFORMED_RESPONSE')
}

function safeResponseShape(value: unknown) {
  if (!value || typeof value !== 'object') return typeof value
  return Object.entries(value).map(([key, field]) => {
    const safeKey = /^[a-zA-Z][a-zA-Z0-9]{0,40}$/.test(key) ? key : 'field'
    return `${safeKey}_${Array.isArray(field) ? 'array' : field === null ? 'null' : typeof field}`
  }).join('_').slice(0, 180)
}

function adapterFailure(error: unknown) {
  if (error instanceof HermesBotError) return error
  if (error instanceof Error && /^HERMES_ADAPTER_\d{3}(?:_[a-zA-Z0-9_]{1,200})?$/.test(error.message)) return new HermesBotError(error.message)
  return new HermesBotError('ADAPTER_FAILURE')
}

export async function reconcileHermesBotAssignment(context: ProjectContext, employeeProjectAssignmentId: string, adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  if (!administerRoles.has(context.project.role)) throw new HermesBotError('FORBIDDEN')
  const member = await actor(context)
  const loaded = await loadAssignment(context.project.id, employeeProjectAssignmentId)
  if (loaded.runtimeAssignment.assignmentState === HermesRuntimeAssignmentState.RETIRED) throw new HermesBotError('RUNTIME_RETIRED')
  const desired = compileHermesBotDesiredState(loaded)
  const current = loaded.runtimeAssignment
  const collision = await prisma.hermesRuntimeAssignment.findFirst({ where: { projectId: context.project.id, profileKey: desired.profileId, id: { not: current.id } }, select: { id: true } })
  if (collision) throw new HermesBotError('RUNTIME_IDENTITY_COLLISION')
  const model = approvedRuntimeConfig()
  const drifted = current.provisioningState !== 'READY' || current.reconciliationState !== 'IN_SYNC' || current.runtimeKind !== HermesRuntimeKind.HERMES_BOT || current.desiredDisplayName !== desired.displayName || current.desiredDescription !== desired.description || current.desiredSoulHash !== desired.soul.hash || current.desiredModelProvider !== desired.runtime.provider || current.desiredModelId !== desired.runtime.modelId
  await prisma.hermesRuntimeAssignment.update({ where: { id: current.id }, data: { provisioningState: drifted ? 'PROVISIONING' : current.provisioningState, reconciliationState: 'SYNCING', lastReconcileError: null } })
  await audit(context, member.id, 'runtime.bot.reconcile.requested', current.id, 'Hermes Bot reconciliation requested', { profileId: desired.profileId, drifted })
  try {
    if (drifted) {
      const ensured = await adapter.ensureBot({ profileId: desired.profileId }); validateProfile(ensured.profileId, desired.profileId)
      const identity = await adapter.updateBotIdentity(desired.profileId, { displayName: desired.displayName, description: desired.description }); validateProfile(identity.profileId, desired.profileId)
      const projected = await adapter.updateBotSoul(desired.profileId, desired.soul); validateProfile(projected.profileId, desired.profileId)
      if (model.explicitlyConfigured) { const configured = await adapter.updateBotRuntimeConfig(desired.profileId, desired.runtime); validateProfile(configured.profileId, desired.profileId) }
      if (current.desiredSkillRevision > 0) await adapter.reconcileBotSkills(desired.profileId, desired.approvedSkills)
    }
    const [bot, status, skills, routines, sessions, capability] = await Promise.all([
      adapter.getBot(desired.profileId), adapter.getBotRuntimeStatus(desired.profileId), adapter.listBotSkills(desired.profileId), adapter.listBotRoutines(desired.profileId), adapter.listBotSessions(desired.profileId), adapter.getBotCapabilityFingerprint(desired.profileId),
    ])
    if (!bot?.profileId) throw new HermesBotError('ADAPTER_MALFORMED_BOT_RESPONSE')
    if (!status?.profileId) throw new HermesBotError('ADAPTER_MALFORMED_STATUS_RESPONSE')
    validateProfile(bot.profileId, desired.profileId); validateProfile(status.profileId, desired.profileId)
    if (!Array.isArray(skills)) throw new HermesBotError('ADAPTER_MALFORMED_SKILLS_RESPONSE')
    if (!Array.isArray(routines)) throw new HermesBotError(`ADAPTER_MALFORMED_ROUTINES_RESPONSE_${safeResponseShape(routines)}`)
    if (!Array.isArray(sessions)) throw new HermesBotError('ADAPTER_MALFORMED_SESSIONS_RESPONSE')
    const capabilityFingerprint = capability?.fingerprint || capability?.capabilityFingerprint
    if (!capabilityFingerprint) throw new HermesBotError('ADAPTER_MALFORMED_CAPABILITY_RESPONSE')
    const saved = await prisma.hermesRuntimeAssignment.update({ where: { id: current.id }, data: {
      runtimeKind: HermesRuntimeKind.HERMES_BOT, provisioningState: 'READY', reconciliationState: 'IN_SYNC', assignmentState: status.state, active: status.state === 'ACTIVE',
      desiredDisplayName: desired.displayName, desiredDescription: desired.description, desiredSoulHash: desired.soul.hash, desiredModelProvider: desired.runtime.provider, desiredModelId: desired.runtime.modelId,
      lastObservedHermesVersion: status.hermesVersion, capabilityFingerprint, runtimeStatus: status.healthy ? 'HEALTHY' : 'UNHEALTHY', lastReconciledAt: new Date(), lastReconcileError: null,
      externalRuntimeMetadata: safeMetadata({ botModeAvailable: status.botModeAvailable, botChatAvailable: status.botChatAvailable, skillsAvailable: status.skillsAvailable, routinesAvailable: status.routinesAvailable, skillCount: skills.length, skills: skills.map(skill => ({ key: skill.key, name: skill.name, bundled: Boolean(skill.bundled) })), routineCount: routines.length, routines: routines.map(routine => ({ id: routine.id, name: routine.name, enabled: routine.enabled })), sessionCount: sessions.length }),
    } })
    await audit(context, member.id, 'runtime.bot.reconciled', current.id, 'Hermes Bot reconciliation succeeded', { profileId: desired.profileId, capabilityFingerprint, drifted })
    return saved
  } catch (error) {
    const failure = adapterFailure(error)
    await prisma.hermesRuntimeAssignment.update({ where: { id: current.id }, data: { provisioningState: 'FAILED', reconciliationState: 'FAILED', lastReconcileError: failure.code } })
    await audit(context, member.id, 'runtime.bot.reconcile.failed', current.id, 'Hermes Bot reconciliation failed safely', { profileId: desired.profileId })
    throw failure
  }
}

async function conversationFor(context: ProjectContext, loaded: LoadedAssignment) {
  const slug = `runtime-${loaded.runtimeAssignment.id}`
  const conversation = await prisma.conversation.upsert({
    where: { projectId_slug: { projectId: context.project.id, slug } },
    create: { projectId: context.project.id, type: 'DIRECT', slug, title: `${loaded.assignment.employee.name} Bot Chat`, createdById: context.user.id, participants: { create: [{ userId: context.user.id }, { employeeProjectAssignmentId: loaded.assignment.id, systemIdentity: systemIdentity(loaded.runtimeAssignment.profileKey) }] } },
    update: {},
  })
  await prisma.conversationParticipant.upsert({ where: { conversationId_userId: { conversationId: conversation.id, userId: context.user.id } }, create: { projectId: context.project.id, conversationId: conversation.id, userId: context.user.id }, update: {} })
  return conversation
}

export async function sendHermesBotMessage(context: ProjectContext, employeeProjectAssignmentId: string, message: string, adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  if (!operateRoles.has(context.project.role)) throw new HermesBotError('FORBIDDEN')
  const text = message.trim().slice(0, 10_000); if (!text) throw new HermesBotError('INVALID_MESSAGE')
  const member = await actor(context)
  const loaded = await loadAssignment(context.project.id, employeeProjectAssignmentId)
  if (!loaded.runtimeAssignment.active || loaded.runtimeAssignment.assignmentState !== 'ACTIVE' || loaded.assignment.status !== 'ACTIVE') throw new HermesBotError('RUNTIME_SUSPENDED')
  const profileId = expectedProfile(loaded); if (profileId !== loaded.runtimeAssignment.profileKey) throw new HermesBotError('INVALID_RUNTIME_IDENTITY')
  const correlationId = randomUUID(); const conversation = await conversationFor(context, loaded)
  await prisma.message.create({ data: { projectId: context.project.id, conversationId: conversation.id, authorUserId: context.user.id, body: text, kind: `BOT_CHAT_REQUEST:${correlationId}` } })
  await audit(context, member.id, 'runtime.bot.chat.requested', loaded.runtimeAssignment.id, 'Hermes Bot Chat requested', { correlationId, profileId, conversationId: conversation.id })
  try {
    const response = await adapter.sendBotMessage(profileId, text, correlationId)
    validateProfile(response.profileId, profileId)
    if (response.correlationId !== correlationId || !response.result?.trim()) throw new HermesBotError('ADAPTER_MALFORMED_RESPONSE')
    const saved = await prisma.message.create({ data: { projectId: context.project.id, conversationId: conversation.id, authorSystemIdentity: systemIdentity(profileId), body: response.result.trim().slice(0, 20_000), kind: `BOT_CHAT_RESPONSE:${correlationId}` } })
    await audit(context, member.id, 'runtime.bot.chat.succeeded', loaded.runtimeAssignment.id, 'Hermes Bot Chat succeeded', { correlationId, profileId, conversationId: conversation.id, responseMessageId: saved.id, sessionId: response.sessionId || null })
    return { correlationId, conversationId: conversation.id, messageId: saved.id, result: saved.body, sessionId: response.sessionId || null }
  } catch (error) {
    await audit(context, member.id, 'runtime.bot.chat.failed', loaded.runtimeAssignment.id, 'Hermes Bot Chat failed safely', { correlationId, profileId, conversationId: conversation.id })
    throw adapterFailure(error)
  }
}

export async function setHermesBotSuspension(context: ProjectContext, employeeProjectAssignmentId: string, action: 'suspend' | 'resume', adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  if (!administerRoles.has(context.project.role)) throw new HermesBotError('FORBIDDEN')
  const member = await actor(context); const loaded = await loadAssignment(context.project.id, employeeProjectAssignmentId); const profileId = expectedProfile(loaded)
  if (profileId !== loaded.runtimeAssignment.profileKey || loaded.runtimeAssignment.assignmentState === 'RETIRED') throw new HermesBotError('INVALID_RUNTIME_IDENTITY')
  if (action === 'suspend') {
    const result = await adapter.suspendBotAssignment(profileId); validateProfile(result.profileId, profileId)
    await prisma.$transaction([prisma.hermesRuntimeAssignment.update({ where: { id: loaded.runtimeAssignment.id }, data: { active: false, assignmentState: 'SUSPENDED', runtimeStatus: 'SUSPENDED', suspendedAt: new Date(), reconciliationState: 'IN_SYNC' } }), prisma.employeeProjectAssignment.update({ where: { id: loaded.assignment.id }, data: { status: 'PAUSED', pausedAt: new Date() } })])
    await audit(context, member.id, 'runtime.bot.suspended', loaded.runtimeAssignment.id, 'Hermes Bot assignment suspended', { profileId })
  } else {
    const result = await adapter.resumeBotAssignment(profileId); validateProfile(result.profileId, profileId)
    await prisma.$transaction([prisma.hermesRuntimeAssignment.update({ where: { id: loaded.runtimeAssignment.id }, data: { active: true, assignmentState: 'ACTIVE', runtimeStatus: 'HEALTHY', suspendedAt: null, reconciliationState: 'DRIFTED' } }), prisma.employeeProjectAssignment.update({ where: { id: loaded.assignment.id }, data: { status: 'ACTIVE', pausedAt: null } })])
    await audit(context, member.id, 'runtime.bot.resumed', loaded.runtimeAssignment.id, 'Hermes Bot assignment resumed', { profileId })
  }
  return loadAssignment(context.project.id, employeeProjectAssignmentId)
}

export async function getHermesBotAssignment(context: ProjectContext, employeeProjectAssignmentId: string) {
  const loaded = await loadAssignment(context.project.id, employeeProjectAssignmentId)
  if (expectedProfile(loaded) !== loaded.runtimeAssignment.profileKey) throw new HermesBotError('INVALID_RUNTIME_IDENTITY')
  return loaded.runtimeAssignment
}
