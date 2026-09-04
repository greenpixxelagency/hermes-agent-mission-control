import { AppInstallationStatus, AuditActorType, Prisma, ProjectToolStatus } from '@prisma/client'

import { recordAuditEvent, safeMetadata } from '@/lib/audit'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'
import { canManageAppMarket, canSetAppInstallationStatus } from '@/lib/app-market-rules'

const marketKey = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class AppMarketError extends Error {
  constructor(public readonly code: string) { super(code) }
}

export { canManageAppMarket, canSetAppInstallationStatus } from '@/lib/app-market-rules'

async function requireManager(context: ProjectContext) {
  if (!canManageAppMarket(context.project.role)) throw new AppMarketError('FORBIDDEN')
  const member = await prisma.projectMember.findFirst({
    where: { projectId: context.project.id, organizationMember: { userId: context.user.id } },
    select: { id: true },
  })
  if (!member) throw new AppMarketError('FORBIDDEN')
  return member
}

export async function listAppMarketManifests(context: ProjectContext) {
  await requireManager(context)
  const versions = await prisma.appMarketManifestVersion.findMany({
    where: { isEnabled: true },
    include: { manifest: { select: { key: true } }, toolDefinition: { select: { key: true } } },
    orderBy: [{ manifest: { key: 'asc' } }, { version: 'desc' }],
  })
  const current = new Set<string>()
  return versions.flatMap(version => {
    if (current.has(version.manifest.key)) return []
    current.add(version.manifest.key)
    return [{
      key: version.manifest.key, version: version.version, name: version.name,
      description: version.description, category: version.category, kind: version.kind,
      toolKey: version.toolDefinition.key, capabilityKeys: version.capabilityKeys,
      connectionType: version.connectionType,
    }]
  })
}

export async function installAppMarketManifest(context: ProjectContext, input: { manifestKey?: unknown; version?: unknown }) {
  const member = await requireManager(context)
  const manifestKey = typeof input.manifestKey === 'string' && marketKey.test(input.manifestKey) ? input.manifestKey : ''
  const version = typeof input.version === 'number' && Number.isInteger(input.version) && input.version > 0 ? input.version : 0
  if (!manifestKey || !version) throw new AppMarketError('INVALID_MANIFEST')
  const manifest = await prisma.appMarketManifestVersion.findFirst({
    where: { version, isEnabled: true, manifest: { key: manifestKey } },
    include: { manifest: { select: { key: true } }, toolDefinition: { select: { id: true, key: true, name: true } } },
  })
  if (!manifest) throw new AppMarketError('MANIFEST_NOT_FOUND')
  const snapshot = safeMetadata({
    manifestKey, manifestVersion: manifest.version, name: manifest.name, category: manifest.category,
    kind: manifest.kind, toolKey: manifest.toolDefinition.key, capabilityKeys: manifest.capabilityKeys,
    connectionType: manifest.connectionType, capabilityGrants: 'NONE', credentialMaterial: 'NONE',
  }) as Prisma.InputJsonValue
  const result = await prisma.$transaction(async tx => {
    const projectTool = await tx.projectTool.upsert({
      where: { projectId_toolDefinitionId: { projectId: context.project.id, toolDefinitionId: manifest.toolDefinition.id } },
      create: { projectId: context.project.id, toolDefinitionId: manifest.toolDefinition.id, status: ProjectToolStatus.DISCONNECTED },
      update: {},
    })
    const existing = await tx.projectAppInstallation.findUnique({
      where: { projectId_manifestKey: { projectId: context.project.id, manifestKey } },
    })
    if (existing && existing.status !== AppInstallationStatus.UNINSTALLED) return { installation: existing, created: false }
    const installation = existing
      ? await tx.projectAppInstallation.update({
          where: { id: existing.id },
          data: { projectToolId: projectTool.id, manifestVersionId: manifest.id, manifestVersion: manifest.version, status: AppInstallationStatus.INSTALLED, configurationSnapshot: snapshot, installedByProjectMemberId: member.id, uninstalledAt: null },
        })
      : await tx.projectAppInstallation.create({
          data: { projectId: context.project.id, projectToolId: projectTool.id, manifestVersionId: manifest.id, manifestKey, manifestVersion: manifest.version, configurationSnapshot: snapshot, installedByProjectMemberId: member.id },
        })
    return { installation, created: true }
  })
  if (result.created) await recordAuditEvent({
    projectId: context.project.id, eventType: 'app_market.installed', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id },
    targetType: 'ProjectAppInstallation', targetId: result.installation.id, projectToolId: result.installation.projectToolId,
    summary: `${manifest.name} installed from the app market`, metadata: { manifestKey, manifestVersion: manifest.version, capabilityGrants: 'NONE', credentialMaterial: 'NONE' },
  })
  return result
}

export async function updateAppInstallationLifecycle(context: ProjectContext, installationId: string, status: AppInstallationStatus) {
  const member = await requireManager(context)
  if (!canSetAppInstallationStatus(status)) throw new AppMarketError('INVALID_LIFECYCLE_STATUS')
  const prior = await prisma.projectAppInstallation.findFirst({ where: { id: installationId, projectId: context.project.id } })
  if (!prior) throw new AppMarketError('INSTALLATION_NOT_FOUND')
  if (prior.status === AppInstallationStatus.UNINSTALLED) throw new AppMarketError('INSTALLATION_UNINSTALLED')
  const installation = await prisma.projectAppInstallation.update({
    where: { id: prior.id }, data: { status, uninstalledAt: status === AppInstallationStatus.UNINSTALLED ? new Date() : null },
  })
  await recordAuditEvent({
    projectId: context.project.id, eventType: `app_market.lifecycle.${status.toLowerCase()}`,
    actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectAppInstallation', targetId: installation.id,
    projectToolId: installation.projectToolId, summary: `App installation changed to ${status}`,
    metadata: { priorStatus: prior.status, status },
  })
  return installation
}
