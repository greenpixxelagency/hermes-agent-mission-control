import { createHash, randomBytes } from 'crypto'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { decryptDriveCredential, encryptDriveCredential, isDriveOAuthConfigured } from '@/lib/drive-crypto'
import { AuditActorType, ConnectionCredentialStatus, ConnectionStatus, ProjectToolStatus } from '@prisma/client'
import { recordAuditEvent } from '@/lib/audit'

// drive.readonly is the narrowest scope that can browse arbitrary existing
// folders AND retrieve selected supported file content. drive.file cannot do
// that without a Picker-created file grant, so it is intentionally unsuitable.
export const GOOGLE_DRIVE_READ_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/drive.readonly',
] as const
export const DRIVE_CALLBACK_PATH = '/api/connections/google-drive/callback'
export type DriveTokens = { accessToken: string; refreshToken?: string; expiryDate?: number | null }

function stateHash(state: string) { return createHash('sha256').update(state).digest('hex') }
export function driveRedirectUri(origin?: string) {
  const configured = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI
  if (configured) return configured
  const base = process.env.NEXTAUTH_URL || origin
  if (!base) throw new Error('DRIVE_OAUTH_REDIRECT_URI_MISSING')
  return new URL(DRIVE_CALLBACK_PATH, base).toString()
}
function client(origin?: string) {
  if (!isDriveOAuthConfigured()) throw new Error('DRIVE_OAUTH_NOT_CONFIGURED')
  return new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET, driveRedirectUri(origin))
}

export async function beginDriveOAuth(input: { projectId: string; userId: string; origin?: string }) {
  const state = randomBytes(32).toString('base64url')
  await prisma.driveOAuthState.create({ data: { projectId: input.projectId, userId: input.userId, stateHash: stateHash(state), expiresAt: new Date(Date.now() + 10 * 60_000) } })
  return client(input.origin).generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [...GOOGLE_DRIVE_READ_SCOPES], state, include_granted_scopes: false })
}

export async function consumeDriveOAuthState(input: { state: string; userId: string }) {
  const record = await prisma.driveOAuthState.findFirst({ where: { stateHash: stateHash(input.state), userId: input.userId, usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, projectId: true, project: { select: { slug: true } } } })
  if (!record || (await prisma.driveOAuthState.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } })).count !== 1) throw new Error('DRIVE_OAUTH_STATE_DENIED')
  return record
}

export async function finishDriveOAuth(input: { projectId?: string; userId: string; state: string; code: string; origin?: string }) {
  const state = await consumeDriveOAuthState({ state: input.state, userId: input.userId })
  const projectId = input.projectId ?? state.projectId
  if (projectId !== state.projectId) throw new Error('DRIVE_OAUTH_STATE_DENIED')
  const oauth = client(input.origin)
  const { tokens } = await oauth.getToken(input.code)
  if (!tokens.access_token) throw new Error('DRIVE_OAUTH_TOKEN_MISSING')
  const tool = await prisma.toolDefinition.findUniqueOrThrow({ where: { key: 'google_drive' } })
  const projectTool = await prisma.projectTool.upsert({ where: { projectId_toolDefinitionId: { projectId, toolDefinitionId: tool.id } }, create: { projectId, toolDefinitionId: tool.id, status: ProjectToolStatus.CONNECTED, displayName: 'Google Drive' }, update: { status: ProjectToolStatus.CONNECTED } })
  const connection = await prisma.projectConnection.upsert({ where: { projectId_projectToolId: { projectId, projectToolId: projectTool.id } }, create: { projectId, projectToolId: projectTool.id, name: 'Google Drive', status: ConnectionStatus.CONNECTED, enabled: true, metadata: { provider: 'google_drive', scopes: ['drive.readonly'] } }, update: { status: ConnectionStatus.CONNECTED, enabled: true, metadata: { provider: 'google_drive', scopes: ['drive.readonly'] } } })
  const profile = await google.oauth2('v2').userinfo.get({ auth: Object.assign(oauth, { credentials: tokens }) }).catch(() => ({ data: {} as { email?: string; name?: string } }))
  const payload: DriveTokens = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? undefined, expiryDate: tokens.expiry_date }
  await prisma.connectionCredential.upsert({ where: { connectionId: connection.id }, create: { projectId, connectionId: connection.id, provider: 'google_drive', encryptedPayload: encryptDriveCredential(payload), expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null, status: ConnectionCredentialStatus.ACTIVE, accountEmail: profile.data.email ?? null, accountDisplayName: profile.data.name ?? null }, update: { encryptedPayload: encryptDriveCredential(payload), expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null, status: ConnectionCredentialStatus.ACTIVE, accountEmail: profile.data.email ?? null, accountDisplayName: profile.data.name ?? null } })
  const member = await prisma.projectMember.findFirst({ where: { projectId, organizationMember: { userId: input.userId } }, select: { id: true } })
  if (member) await recordAuditEvent({ projectId, eventType: 'drive.connection.connected', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectConnection', targetId: connection.id, projectToolId: projectTool.id, summary: 'Google Drive connection established', metadata: { provider: 'google_drive', account: profile.data.email ? 'connected' : 'not-returned' } })
  return { connection, projectSlug: state.project.slug }
}

export async function disconnectDriveConnection(projectId: string, connectionId: string) {
  await prisma.connectionCredential.updateMany({ where: { projectId, connectionId }, data: { status: ConnectionCredentialStatus.REVOKED } })
  return prisma.projectConnection.update({ where: { id: connectionId }, data: { status: ConnectionStatus.DISCONNECTED, enabled: false } })
}

export async function activeDriveTokens(projectId: string, connectionId: string): Promise<DriveTokens> {
  const credential = await prisma.connectionCredential.findFirst({ where: { projectId, connectionId, provider: 'google_drive', status: ConnectionCredentialStatus.ACTIVE } })
  if (!credential) throw new Error('DRIVE_CREDENTIAL_UNAVAILABLE')
  const tokens = decryptDriveCredential<DriveTokens>(credential.encryptedPayload)
  if (tokens.expiryDate && tokens.expiryDate <= Date.now() + 60_000) {
    if (!tokens.refreshToken) return markDriveNeedsAttention(projectId, connectionId, 'DRIVE_REFRESH_UNAVAILABLE')
    try {
      const oauth = client(); oauth.setCredentials({ refresh_token: tokens.refreshToken })
      const refreshed = await oauth.getAccessToken()
      if (!refreshed.token) throw new Error('NO_TOKEN')
      const next: DriveTokens = { ...tokens, accessToken: refreshed.token, expiryDate: oauth.credentials.expiry_date }
      await prisma.connectionCredential.update({ where: { connectionId }, data: { encryptedPayload: encryptDriveCredential(next), expiresAt: next.expiryDate ? new Date(next.expiryDate) : null } })
      return next
    } catch { return markDriveNeedsAttention(projectId, connectionId, 'DRIVE_REFRESH_DENIED') }
  }
  return tokens
}

async function markDriveNeedsAttention(projectId: string, connectionId: string, code: string): Promise<never> {
  await prisma.$transaction([prisma.connectionCredential.updateMany({ where: { projectId, connectionId }, data: { status: ConnectionCredentialStatus.NEEDS_ATTENTION } }), prisma.projectConnection.updateMany({ where: { projectId, id: connectionId }, data: { status: ConnectionStatus.NEEDS_ATTENTION } })])
  throw new Error(code)
}
