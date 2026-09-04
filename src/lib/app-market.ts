import { createHash } from 'node:crypto'

import { AppInstallationStatus, ApprovalStatus, AuditActorType, ConnectionCredentialStatus, ConnectionStatus, Prisma, ProjectToolStatus, ToolExecutionStatus } from '@prisma/client'

import { recordAuditEvent, safeMetadata } from '@/lib/audit'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'
import { toolAdapterFor } from '@/lib/tool-adapters'
import { canManageAppMarket, canSetAppInstallationStatus, canTransitionAppInstallation, isAppInstallationAction } from '@/lib/app-market-rules'
import type { AppInstallationAction } from '@/lib/app-market-rules'

const marketKey = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const idempotencyKey = /^[A-Za-z0-9._:-]{8,200}$/

export class AppMarketError extends Error {
  constructor(public readonly code: string) { super(code) }
}

export { canManageAppMarket, canSetAppInstallationStatus, canTransitionAppInstallation, isAppInstallationAction }
export type { AppInstallationAction }

type Manager = { id: string }
type MutationClaim = { id: string; replayed: boolean; result: Record<string, unknown> }
type DbClient = typeof prisma | Prisma.TransactionClient

async function requireManager(context: ProjectContext): Promise<Manager> {
  if (!canManageAppMarket(context.project.role)) throw new AppMarketError('FORBIDDEN')
  const member = await prisma.projectMember.findFirst({
    where: { projectId: context.project.id, organizationMember: { userId: context.user.id } },
    select: { id: true },
  })
  if (!member) throw new AppMarketError('FORBIDDEN')
  return member
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(safeMetadata(value))).digest('hex')
}

function checkedIdempotencyKey(value: string | undefined) {
  if (!value || !idempotencyKey.test(value)) throw new AppMarketError('IDEMPOTENCY_KEY_REQUIRED')
  return value
}

async function claimMutation(input: { context: ProjectContext; member: Manager; operation: string; key?: string; request: unknown }): Promise<MutationClaim> {
  const key = checkedIdempotencyKey(input.key)
  const requestFingerprint = fingerprint(input.request)
  const existing = await prisma.appMarketMutation.findUnique({ where: { projectId_idempotencyKey: { projectId: input.context.project.id, idempotencyKey: key } } })
  if (existing) {
    if (existing.operation !== input.operation || existing.requestFingerprint !== requestFingerprint) throw new AppMarketError('IDEMPOTENCY_KEY_REUSED')
    if (!existing.completedAt) throw new AppMarketError('IDEMPOTENCY_IN_PROGRESS')
    return { id: existing.id, replayed: true, result: existing.result as Record<string, unknown> }
  }
  try {
    const created = await prisma.appMarketMutation.create({ data: { projectId: input.context.project.id, actorProjectMemberId: input.member.id, idempotencyKey: key, operation: input.operation, requestFingerprint } })
    return { id: created.id, replayed: false, result: {} }
  } catch {
    const raced = await prisma.appMarketMutation.findUnique({ where: { projectId_idempotencyKey: { projectId: input.context.project.id, idempotencyKey: key } } })
    if (!raced) throw new AppMarketError('IDEMPOTENCY_IN_PROGRESS')
    if (raced.operation !== input.operation || raced.requestFingerprint !== requestFingerprint) throw new AppMarketError('IDEMPOTENCY_KEY_REUSED')
    if (!raced.completedAt) throw new AppMarketError('IDEMPOTENCY_IN_PROGRESS')
    return { id: raced.id, replayed: true, result: raced.result as Record<string, unknown> }
  }
}

async function completeMutation(id: string, result: unknown, db: DbClient = prisma) {
  await db.appMarketMutation.update({ where: { id }, data: { result: safeMetadata(result), completedAt: new Date() } })
}

async function releaseMutation(id: string) {
  try {
    await prisma.appMarketMutation.updateMany({ where: { id, completedAt: null }, data: { result: { error: 'MUTATION_FAILED' }, completedAt: new Date() } })
  } catch {
    await prisma.appMarketMutation.deleteMany({ where: { id, completedAt: null } })
  }
}

async function installationForReplay(projectId: string, result: Record<string, unknown>) {
  const installationId = typeof result.installationId === 'string' ? result.installationId : ''
  if (!installationId) throw new AppMarketError('IDEMPOTENCY_RESULT_INVALID')
  const installation = await prisma.projectAppInstallation.findFirst({ where: { id: installationId, projectId } })
  if (!installation) throw new AppMarketError('IDEMPOTENCY_RESULT_INVALID')
  return installation
}

export async function listAppMarketManifests(context: ProjectContext) {
  await requireManager(context)
  const versions = await prisma.appMarketManifestVersion.findMany({ where: { isEnabled: true }, include: { manifest: { select: { key: true } }, toolDefinition: { select: { key: true } } }, orderBy: [{ manifest: { key: 'asc' } }, { version: 'desc' }] })
  const current = new Set<string>()
  return versions.flatMap(version => {
    if (current.has(version.manifest.key)) return []
    current.add(version.manifest.key)
    return [{ key: version.manifest.key, version: version.version, name: version.name, description: version.description, category: version.category, kind: version.kind, toolKey: version.toolDefinition.key, capabilityKeys: version.capabilityKeys, connectionType: version.connectionType }]
  })
}

export async function listProjectAppInstallations(context: ProjectContext) {
  await requireManager(context)
  return prisma.projectAppInstallation.findMany({
    where: { projectId: context.project.id },
    include: {
      manifestVersionRecord: { select: { name: true, category: true, kind: true, capabilityKeys: true, connectionType: true } },
      projectTool: { select: { id: true, status: true, tool: { select: { key: true, name: true } }, connections: { select: { id: true, name: true, status: true, enabled: true, credential: { select: { status: true, expiresAt: true } } } } } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getProjectAppInstallation(context: ProjectContext, installationId: string) {
  await requireManager(context)
  const installation = await prisma.projectAppInstallation.findFirst({ where: { id: installationId, projectId: context.project.id }, include: { manifestVersionRecord: true, projectTool: { include: { tool: true, connections: { select: { id: true, name: true, status: true, enabled: true, credential: { select: { status: true, expiresAt: true } } } } } } } })
  if (!installation) throw new AppMarketError('INSTALLATION_NOT_FOUND')
  return installation
}

export async function installAppMarketManifest(context: ProjectContext, input: { manifestKey?: unknown; version?: unknown; idempotencyKey?: string }) {
  const member = await requireManager(context)
  const manifestKey = typeof input.manifestKey === 'string' && marketKey.test(input.manifestKey) ? input.manifestKey : ''
  const version = typeof input.version === 'number' && Number.isInteger(input.version) && input.version > 0 ? input.version : 0
  if (!manifestKey || !version) throw new AppMarketError('INVALID_MANIFEST')
  const manifest = await prisma.appMarketManifestVersion.findFirst({ where: { version, isEnabled: true, manifest: { key: manifestKey } }, include: { toolDefinition: { select: { id: true, key: true, name: true } } } })
  if (!manifest) throw new AppMarketError('MANIFEST_NOT_FOUND')
  const claim = await claimMutation({ context, member, operation: 'install', key: input.idempotencyKey, request: { manifestKey, version } })
  if (claim.replayed) return { installation: await installationForReplay(context.project.id, claim.result), created: Boolean(claim.result.created), replayed: true }
  const snapshot = safeMetadata({ manifestKey, manifestVersion: manifest.version, name: manifest.name, category: manifest.category, kind: manifest.kind, toolKey: manifest.toolDefinition.key, capabilityKeys: manifest.capabilityKeys, connectionType: manifest.connectionType, capabilityGrants: 'NONE', credentialMaterial: 'NONE' }) as Prisma.InputJsonValue
  try {
    const result = await prisma.$transaction(async tx => {
      const projectTool = await tx.projectTool.upsert({ where: { projectId_toolDefinitionId: { projectId: context.project.id, toolDefinitionId: manifest.toolDefinition.id } }, create: { projectId: context.project.id, toolDefinitionId: manifest.toolDefinition.id, status: ProjectToolStatus.DISCONNECTED }, update: {} })
      const existing = await tx.projectAppInstallation.findUnique({ where: { projectId_manifestKey: { projectId: context.project.id, manifestKey } } })
      const forTool = await tx.projectAppInstallation.findFirst({ where: { projectId: context.project.id, projectToolId: projectTool.id } })
      if (forTool && forTool.manifestKey !== manifestKey) throw new AppMarketError('TOOL_ALREADY_INSTALLED')
      const result = existing && existing.status !== AppInstallationStatus.UNINSTALLED
        ? { installation: existing, created: false }
        : { installation: existing
          ? await tx.projectAppInstallation.update({ where: { id: existing.id }, data: { projectToolId: projectTool.id, manifestVersionId: manifest.id, manifestVersion: manifest.version, status: AppInstallationStatus.INSTALLED, configurationSnapshot: snapshot, installedByProjectMemberId: member.id, uninstalledAt: null } })
          : await tx.projectAppInstallation.create({ data: { projectId: context.project.id, projectToolId: projectTool.id, manifestVersionId: manifest.id, manifestKey, manifestVersion: manifest.version, configurationSnapshot: snapshot, installedByProjectMemberId: member.id } }), created: true }
      if (existing && result.created) await tx.projectTool.update({ where: { id: projectTool.id }, data: { status: ProjectToolStatus.DISCONNECTED } })
      await completeMutation(claim.id, { installationId: result.installation.id, created: result.created }, tx)
      if (result.created) await recordAuditEvent({ projectId: context.project.id, eventType: 'app_market.installed', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectAppInstallation', targetId: result.installation.id, projectToolId: result.installation.projectToolId, summary: `${manifest.name} installed from the app market`, metadata: { manifestKey, manifestVersion: manifest.version, capabilityGrants: 'NONE', credentialMaterial: 'NONE' } }, tx)
      return result
    })
    return { ...result, replayed: false }
  } catch (error) {
    await releaseMutation(claim.id)
    throw error
  }
}

export async function changeAppInstallationLifecycle(context: ProjectContext, installationId: string, action: AppInstallationAction, idempotencyKey?: string) {
  const member = await requireManager(context)
  const prior = await prisma.projectAppInstallation.findFirst({ where: { id: installationId, projectId: context.project.id }, include: { projectTool: { include: { connections: { include: { credential: true } } } } } })
  if (!prior) throw new AppMarketError('INSTALLATION_NOT_FOUND')
  const connection = prior.projectTool.connections[0]
  const connectionReady = Boolean(connection && connection.status === ConnectionStatus.CONNECTED && connection.credential?.status === ConnectionCredentialStatus.ACTIVE)
  if (!canTransitionAppInstallation(prior.status, action, connectionReady)) throw new AppMarketError(action === 'enable' ? 'CONNECTION_REQUIRED' : 'INVALID_LIFECYCLE_STATE')
  const claim = await claimMutation({ context, member, operation: `lifecycle:${action}`, key: idempotencyKey, request: { installationId, action } })
  if (claim.replayed) return { installation: await installationForReplay(context.project.id, claim.result), replayed: true }
  try {
    const result = await prisma.$transaction(async tx => {
      const cancellation = action === 'disable' || action === 'uninstall'
        ? { executions: await tx.toolExecution.updateMany({ where: { projectId: context.project.id, projectToolId: prior.projectToolId, status: ToolExecutionStatus.PENDING_APPROVAL }, data: { status: ToolExecutionStatus.CANCELLED, completedAt: new Date(), errorMessage: 'INSTALLATION_DISABLED' } }), approvals: await tx.approvalRequest.updateMany({ where: { projectId: context.project.id, projectToolId: prior.projectToolId, status: ApprovalStatus.PENDING }, data: { status: ApprovalStatus.CANCELLED } }) }
        : { executions: { count: 0 }, approvals: { count: 0 } }
      const status = action === 'enable' ? AppInstallationStatus.CONNECTED : action === 'disable' ? AppInstallationStatus.DISABLED : AppInstallationStatus.UNINSTALLED
      const changed = await tx.projectAppInstallation.updateMany({ where: { id: prior.id, projectId: context.project.id, status: prior.status }, data: { status, uninstalledAt: action === 'uninstall' ? new Date() : null } })
      if (changed.count !== 1) throw new AppMarketError('LIFECYCLE_CONFLICT')
      const installation = await tx.projectAppInstallation.findUniqueOrThrow({ where: { id: prior.id } })
      await tx.projectTool.update({ where: { id: prior.projectToolId }, data: { status: action === 'enable' ? ProjectToolStatus.CONNECTED : ProjectToolStatus.DISABLED } })
      if (connection) {
        await tx.projectConnection.update({ where: { id: connection.id }, data: { enabled: action === 'enable', status: action === 'uninstall' ? ConnectionStatus.DISABLED : connection.status } })
        if (action === 'uninstall') {
          await tx.connectionCredential.updateMany({ where: { projectId: context.project.id, connectionId: connection.id }, data: { status: ConnectionCredentialStatus.REVOKED } })
          await tx.projectConnectionScope.updateMany({ where: { projectId: context.project.id, connectionId: connection.id }, data: { active: false } })
        }
      }
      const event = action === 'enable' ? 'enabled' : action === 'disable' ? 'disabled' : 'uninstalled'
      const result = { installation, cancelledExecutions: cancellation.executions.count, cancelledApprovals: cancellation.approvals.count }
      await completeMutation(claim.id, { installationId: installation.id }, tx)
      await recordAuditEvent({ projectId: context.project.id, eventType: `app_market.${event}`, actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectAppInstallation', targetId: installation.id, projectToolId: installation.projectToolId, summary: `App installation ${event}`, metadata: { priorStatus: prior.status, status: installation.status, cancelledExecutions: result.cancelledExecutions, cancelledApprovals: result.cancelledApprovals } }, tx)
      return result
    })
    return { installation: result.installation, replayed: false }
  } catch (error) {
    await releaseMutation(claim.id)
    throw error
  }
}

export async function markAppInstallationConnecting(context: ProjectContext, installationId: string) {
  const member = await requireManager(context)
  const installation = await prisma.projectAppInstallation.findFirst({ where: { id: installationId, projectId: context.project.id }, include: { manifestVersionRecord: true } })
  if (!installation) throw new AppMarketError('INSTALLATION_NOT_FOUND')
  if (installation.status === AppInstallationStatus.DISABLED || installation.status === AppInstallationStatus.UNINSTALLED) throw new AppMarketError('INSTALLATION_NOT_ACTIVE')
  if (installation.manifestVersionRecord.connectionType !== 'GOOGLE_DRIVE') throw new AppMarketError('CONNECTION_NOT_SUPPORTED')
  const updated = await prisma.$transaction(async tx => {
    const changed = await tx.projectAppInstallation.updateMany({ where: { id: installation.id, projectId: context.project.id, status: installation.status }, data: { status: AppInstallationStatus.CONNECTING } })
    if (changed.count !== 1) throw new AppMarketError('LIFECYCLE_CONFLICT')
    await tx.projectTool.update({ where: { id: installation.projectToolId }, data: { status: ProjectToolStatus.DISCONNECTED } })
    const updated = await tx.projectAppInstallation.findUniqueOrThrow({ where: { id: installation.id } })
    await recordAuditEvent({ projectId: context.project.id, eventType: 'app_market.connection.connecting', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectAppInstallation', targetId: updated.id, projectToolId: updated.projectToolId, summary: 'App connection authorization started', metadata: { connectionType: 'GOOGLE_DRIVE' } }, tx)
    return updated
  })
  return updated
}

export async function synchronizeAppInstallationConnection(projectId: string, projectToolId: string, status: 'CONNECTED' | 'NEEDS_ATTENTION', db: DbClient = prisma) {
  const prior = await db.projectAppInstallation.findFirst({ where: { projectId, projectToolId } })
  if (!prior || prior.status === AppInstallationStatus.DISABLED || prior.status === AppInstallationStatus.UNINSTALLED) return null
  const synchronize = async (tx: DbClient) => {
    const changed = await tx.projectAppInstallation.updateMany({ where: { id: prior.id, projectId, projectToolId, status: { in: [AppInstallationStatus.INSTALLED, AppInstallationStatus.CONNECTING, AppInstallationStatus.CONNECTED, AppInstallationStatus.NEEDS_ATTENTION] } }, data: { status: status === 'CONNECTED' ? AppInstallationStatus.CONNECTED : AppInstallationStatus.NEEDS_ATTENTION } })
    if (changed.count !== 1) return null
    await tx.projectTool.update({ where: { id: projectToolId }, data: { status: status === 'CONNECTED' ? ProjectToolStatus.CONNECTED : ProjectToolStatus.DISCONNECTED } })
    const updated = await tx.projectAppInstallation.findUniqueOrThrow({ where: { id: prior.id } })
    await recordAuditEvent({ projectId, eventType: `app_market.connection.${status.toLowerCase()}`, actor: { type: AuditActorType.SYSTEM }, targetType: 'ProjectAppInstallation', targetId: updated.id, projectToolId, summary: `App connection is ${status.toLowerCase().replace('_', ' ')}`, metadata: { priorStatus: prior.status, status } }, tx)
    return updated
  }
  const updated = db === prisma ? await prisma.$transaction(synchronize) : await synchronize(db)
  if (!updated) return null
  return updated
}

export async function checkAppInstallationHealth(context: ProjectContext, installationId: string, idempotencyKey?: string) {
  const member = await requireManager(context)
  const installation = await prisma.projectAppInstallation.findFirst({ where: { id: installationId, projectId: context.project.id }, include: { manifestVersionRecord: true, projectTool: { include: { tool: true, connections: { include: { credential: true } } } } } })
  if (!installation) throw new AppMarketError('INSTALLATION_NOT_FOUND')
  if (installation.status === AppInstallationStatus.DISABLED || installation.status === AppInstallationStatus.UNINSTALLED) throw new AppMarketError('INSTALLATION_NOT_ACTIVE')
  const claim = await claimMutation({ context, member, operation: 'health', key: idempotencyKey, request: { installationId } })
  if (claim.replayed) return { installation: await installationForReplay(context.project.id, claim.result), healthy: claim.result.healthy === true, code: typeof claim.result.code === 'string' ? claim.result.code : undefined, replayed: true }
  try {
    const connection = installation.projectTool.connections[0]
    let healthy = false
    let code: string | undefined
    if (!connection || connection.status !== ConnectionStatus.CONNECTED || !connection.enabled || connection.credential?.status !== ConnectionCredentialStatus.ACTIVE) code = 'CONNECTION_REQUIRED'
    else if (installation.manifestVersionRecord.connectionType !== 'GOOGLE_DRIVE' || installation.projectTool.tool.key !== 'google_drive') code = 'HEALTH_NOT_SUPPORTED'
    else {
      try { await toolAdapterFor('google_drive').execute({ projectId: context.project.id, connectionId: connection.id, capabilityKey: 'drive_health', actionKey: 'read', request: {} }); healthy = true }
      catch { code = 'CONNECTION_NEEDS_ATTENTION' }
    }
    const saved = await prisma.$transaction(async tx => {
      const synchronized = await synchronizeAppInstallationConnection(context.project.id, installation.projectToolId, healthy ? 'CONNECTED' : 'NEEDS_ATTENTION', tx)
      const current = synchronized ?? await tx.projectAppInstallation.findUniqueOrThrow({ where: { id: installation.id } })
      await completeMutation(claim.id, { installationId: current.id, healthy, code: code ?? null }, tx)
      await recordAuditEvent({ projectId: context.project.id, eventType: healthy ? 'app_market.health.succeeded' : 'app_market.health.failed', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectAppInstallation', targetId: current.id, projectToolId: installation.projectToolId, summary: healthy ? 'App connection health check succeeded' : 'App connection health check failed safely', metadata: { connectionType: installation.manifestVersionRecord.connectionType, code: code ?? 'OK' } }, tx)
      return current
    })
    return { installation: saved, healthy, code, replayed: false }
  } catch (error) {
    await releaseMutation(claim.id)
    throw error
  }
}
