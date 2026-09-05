import { AppInstallationStatus, AuditActorType, ConnectionCredentialStatus, ConnectionStatus, PolicyEnforcement, ProjectToolStatus } from '@prisma/client'

import { recordAuditEvent } from '@/lib/audit'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'
import { toolAdapterFor } from '@/lib/tool-adapters'

const humanReaderRoles = new Set(['OWNER', 'ADMIN'])
const actions = new Set(['list', 'search', 'read'])

export class DriveWorkspaceError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'DriveWorkspaceError' }
}

/** Human Drive reads are deliberately separate from employee Tool permissions.
 * A person is never represented as an employee assignment. Until a dedicated
 * human capability-grant model is approved, only project Owners/Admins may
 * browse project-selected Drive material; an active read policy can still deny it.
 */
export function canUseDriveWorkspace(role: string) { return humanReaderRoles.has(role) }

export function driveWorkspaceState(input: { installation?: string; tool?: string; connection?: string; enabled?: boolean; credential?: string }) {
  if (!input.installation || input.installation === AppInstallationStatus.UNINSTALLED) return 'UNINSTALLED'
  if (input.installation === AppInstallationStatus.DISABLED) return 'DISABLED'
  return input.installation === AppInstallationStatus.CONNECTED && input.tool === ProjectToolStatus.CONNECTED && input.connection === ConnectionStatus.CONNECTED && input.enabled && input.credential === ConnectionCredentialStatus.ACTIVE ? 'CONNECTED' : 'NEEDS_ATTENTION'
}

export function humanReadPolicyAllows(policies: Array<{ enforcement: string; rule: unknown }>) {
  return !policies.some(policy => policy.rule && typeof policy.rule === 'object' && !Array.isArray(policy.rule) && (policy.rule as { action?: unknown }).action === 'read' && (policy.enforcement === PolicyEnforcement.BLOCK || policy.enforcement === PolicyEnforcement.REQUIRE_APPROVAL))
}

function bounded(value: unknown, max: number) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : '' }

async function memberFor(context: ProjectContext) {
  if (!canUseDriveWorkspace(context.project.role)) throw new DriveWorkspaceError('FORBIDDEN')
  const member = await prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } })
  if (!member) throw new DriveWorkspaceError('FORBIDDEN')
  return member
}

async function resources(context: ProjectContext) {
  const installation = await prisma.projectAppInstallation.findFirst({
    where: { projectId: context.project.id, manifestVersionRecord: { connectionType: 'GOOGLE_DRIVE' } },
    include: {
      projectTool: {
        include: {
          tool: { select: { key: true } },
          connections: { include: { credential: { select: { status: true } } } },
        },
      },
    },
  })
  if (!installation || installation.projectTool.tool.key !== 'google_drive') throw new DriveWorkspaceError('DRIVE_UNINSTALLED')
  if (installation.status === AppInstallationStatus.UNINSTALLED) throw new DriveWorkspaceError('DRIVE_UNINSTALLED')
  if (installation.status === AppInstallationStatus.DISABLED) throw new DriveWorkspaceError('DRIVE_DISABLED')
  const connection = installation.projectTool.connections[0]
  if (!connection || installation.status !== AppInstallationStatus.CONNECTED || installation.projectTool.status !== ProjectToolStatus.CONNECTED || connection.status !== ConnectionStatus.CONNECTED || !connection.enabled || connection.credential?.status !== ConnectionCredentialStatus.ACTIVE) throw new DriveWorkspaceError('DRIVE_NEEDS_ATTENTION')
  return { installation, connection }
}

async function policyAllowsRead(projectId: string) {
  const policies = await prisma.policy.findMany({ where: { projectId, status: 'ACTIVE' }, select: { enforcement: true, rule: true } })
  // Human reads have no approval execution flow. A policy that blocks or
  // requires approval therefore stops this bounded viewer before provider I/O.
  if (!humanReadPolicyAllows(policies)) throw new DriveWorkspaceError('DRIVE_HUMAN_POLICY_DENIED')
}

export async function getDriveWorkspace(context: ProjectContext) {
  await memberFor(context)
  const installation = await prisma.projectAppInstallation.findFirst({
    where: { projectId: context.project.id, manifestVersionRecord: { connectionType: 'GOOGLE_DRIVE' } },
    include: {
      projectTool: {
        include: {
          connections: {
            include: {
              credential: { select: { status: true, expiresAt: true, accountEmail: true, accountDisplayName: true } },
              scopes: {
                where: { active: true },
                select: { id: true, type: true, externalId: true, displayName: true, parentExternalId: true, updatedAt: true },
                orderBy: { displayName: 'asc' },
              },
            },
          },
        },
      },
    },
  })
  const connection = installation?.projectTool.connections[0]
  return {
    state: driveWorkspaceState({ installation: installation?.status, tool: installation?.projectTool.status, connection: connection?.status, enabled: connection?.enabled, credential: connection?.credential?.status }),
    installation: installation ? { id: installation.id, status: installation.status } : null,
    connection: connection ? { id: connection.id, name: connection.name, status: connection.status, enabled: connection.enabled, credential: connection.credential ? { status: connection.credential.status, expiresAt: connection.credential.expiresAt, account: connection.credential.accountEmail ? 'connected' : connection.credential.accountDisplayName ? 'connected' : 'not-returned' } : null } : null,
    scopes: connection?.scopes ?? [],
  }
}

export async function runHumanDriveWorkspaceAction(context: ProjectContext, input: { action?: unknown; fileId?: unknown; parentId?: unknown; query?: unknown }) {
  const action = typeof input.action === 'string' && actions.has(input.action) ? input.action : ''
  const fileId = bounded(input.fileId, 240); const parentId = bounded(input.parentId, 240); const query = bounded(input.query, 160)
  if (!action || (action === 'read' && !fileId) || ((action === 'list' || action === 'search') && !parentId) || (action === 'search' && !query)) throw new DriveWorkspaceError('INVALID_DRIVE_REQUEST')
  const member = await memberFor(context)
  await policyAllowsRead(context.project.id)
  const { installation, connection } = await resources(context)
  const capabilityKey = action === 'read' ? 'drive_read' : action === 'search' ? 'drive_search' : 'drive_list'
  try {
    const result = await toolAdapterFor('google_drive').execute({ projectId: context.project.id, connectionId: connection.id, capabilityKey, actionKey: 'read', request: { fileId: fileId || undefined, parentId: parentId || undefined, query: query || undefined } })
    await recordAuditEvent({ projectId: context.project.id, eventType: 'drive.workspace.read', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectConnection', targetId: connection.id, projectToolId: installation.projectToolId, summary: `Human Drive workspace ${action} completed`, metadata: { action, capabilityKey, scope: action === 'read' ? 'file' : 'folder', result: 'returned' } })
    return { resultText: result.resultText.slice(0, 20_000), metadata: result.metadata ?? {} }
  } catch (error) {
    const code = error instanceof Error && ['DRIVE_SCOPE_DENIED', 'DRIVE_FILE_UNSUPPORTED', 'DRIVE_CREDENTIAL_UNAVAILABLE', 'DRIVE_REFRESH_UNAVAILABLE', 'DRIVE_REFRESH_DENIED'].includes(error.message) ? error.message : 'DRIVE_READ_FAILED'
    await recordAuditEvent({ projectId: context.project.id, eventType: 'drive.workspace.read_denied', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectConnection', targetId: connection.id, projectToolId: installation.projectToolId, summary: `Human Drive workspace ${action} did not complete`, metadata: { action, code } })
    throw new DriveWorkspaceError(code)
  }
}
