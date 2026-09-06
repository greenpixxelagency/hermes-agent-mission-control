import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { AuditActorType, ConnectionCredentialStatus, ConnectionStatus, ProjectToolStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import type { ProjectContext } from '@/lib/project-context'
import { recordAuditEvent } from '@/lib/audit'

const protocol = 'rogeros-hermes-connect-v1'
const baseUrl = () => (process.env.HERMES_STAGING_ADAPTER_URL || (process.env.NODE_ENV === 'development' ? 'https://rogeros-hermes-staging-adapter.srv1899670.hstgr.cloud' : '')).replace(/\/$/, '')

function connectionKey() {
  const value = process.env.ROGEROS_HERMES_CONNECTION_ENCRYPTION_KEY
  const key = value ? Buffer.from(value, 'base64url') : process.env.NODE_ENV === 'development' && process.env.NEXTAUTH_SECRET ? createHash('sha256').update(process.env.NEXTAUTH_SECRET).digest() : null
  if (!key || key.length !== 32) throw new HermesConnectionError('CONNECTION_STORAGE_NOT_CONFIGURED')
  return key
}

export function encryptHermesCredential(value: object) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', connectionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}

function decodeSecret(value: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new HermesConnectionError('INVALID_CONNECTION_SECRET')
  const decoded = Buffer.from(value, 'base64url')
  if (decoded.length !== 32) throw new HermesConnectionError('INVALID_CONNECTION_SECRET')
  return decoded
}
function signature(secret: Buffer, canonical: string) { return createHmac('sha256', secret).update(canonical, 'utf8').digest('base64url') }
function nonce() { return randomBytes(32).toString('base64url') }

async function registerWithHermes(input: { agentId: string; projectId: string; connectionSecret: string }) {
  const host = process.env.HERMES_STAGING_SSH_HOST || (process.env.NODE_ENV === 'development' ? 'rogeros-register@srv1899670.hstgr.cloud' : '')
  if (!host) throw new HermesConnectionError('ADAPTER_REGISTRATION_NOT_CONFIGURED')
  const identity = process.env.HERMES_STAGING_SSH_IDENTITY || (process.env.NODE_ENV === 'development' ? join(homedir(), '.ssh', 'codex_hermes_vps') : '')
  const args = ['-T', '-p', process.env.HERMES_STAGING_SSH_PORT || '22', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15']
  if (identity) args.push('-i', identity)
  args.push(host, '/usr/local/sbin/rogeros-hermes-register-connection')
  const child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true })
  let output = ''
  child.stdout.on('data', chunk => { output += String(chunk) })
  child.stdin.end(JSON.stringify(input))
  const exitCode = await new Promise<number>(resolve => child.once('close', code => resolve(code ?? 1)))
  if (exitCode !== 0) throw new HermesConnectionError('REGISTRATION_FAILED')
  const registered = JSON.parse(output) as { connectionId?: string; status?: string }
  if (!registered.connectionId || registered.status !== 'REGISTERED') throw new HermesConnectionError('REGISTRATION_FAILED')
  return registered
}

export class HermesConnectionError extends Error { constructor(readonly code: string) { super(code) } }

export async function hermesConnectionStatus(context: ProjectContext) {
  const connection = await prisma.projectConnection.findFirst({ where: { projectId: context.project.id, enabled: true, status: ConnectionStatus.CONNECTED, projectTool: { tool: { key: 'hermes-runtime' } } }, select: { id: true, metadata: true } })
  return { connected: Boolean(connection), connectionId: connection?.id ?? null }
}

export async function configureHermesConnection(context: ProjectContext, input: { agentId: string; connectionSecret: string }) {
  if (context.project.role !== 'OWNER' && context.project.role !== 'ADMIN') throw new HermesConnectionError('FORBIDDEN')
  const agentId = input.agentId
  const connectionSecret = input.connectionSecret
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(agentId)) throw new HermesConnectionError('INVALID_AGENT_ID')
  const base = baseUrl()
  if (!base) throw new HermesConnectionError('ADAPTER_NOT_CONFIGURED')
  const secret = decodeSecret(connectionSecret)
  const projectId = 'rogeros-vhalam'
  const registered = await registerWithHermes({ agentId, projectId, connectionSecret })
  const issuedAt = new Date().toISOString(); const requestNonce = nonce()
  const verifyBody = { protocolVersion: protocol, agentId, projectId, nonce: requestNonce, issuedAt }
  const verify = await fetch(`${base}/v1/connection/verify`, { method: 'POST', headers: { Authorization: `Hermes-HMAC-SHA256 ${signature(secret, [protocol, agentId, projectId, requestNonce, issuedAt].join('\n'))}`, 'Content-Type': 'application/json' }, body: JSON.stringify(verifyBody), cache: 'no-store' })
  const verified = await verify.json().catch(() => null) as { connectionId?: string; agentId?: string; projectId?: string; status?: string; nonce?: string; capabilities?: string[] } | null
  if (!verify.ok || verified?.status !== 'VERIFIED' || verified.connectionId !== registered.connectionId || verified.agentId !== agentId || verified.projectId !== projectId || verified.nonce !== requestNonce) throw new HermesConnectionError('VERIFICATION_FAILED')
  const member = await prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } })
  if (!member) throw new HermesConnectionError('FORBIDDEN')
  const result = await prisma.$transaction(async tx => {
    const tool = await tx.toolDefinition.upsert({ where: { key: 'hermes-runtime' }, create: { key: 'hermes-runtime', name: 'Hermes runtime', description: 'Governed Hermes execution runtime' }, update: {} })
    const projectTool = await tx.projectTool.upsert({ where: { projectId_toolDefinitionId: { projectId: context.project.id, toolDefinitionId: tool.id } }, create: { projectId: context.project.id, toolDefinitionId: tool.id, status: ProjectToolStatus.CONNECTED }, update: { status: ProjectToolStatus.CONNECTED } })
    const connection = await tx.projectConnection.upsert({ where: { projectId_projectToolId: { projectId: context.project.id, projectToolId: projectTool.id } }, create: { projectId: context.project.id, projectToolId: projectTool.id, name: 'Hermes Agent', status: ConnectionStatus.CONNECTED, metadata: { agentId, hermesConnectionId: registered.connectionId, hermesProjectId: projectId, capabilities: verified.capabilities ?? [] } }, update: { status: ConnectionStatus.CONNECTED, metadata: { agentId, hermesConnectionId: registered.connectionId, hermesProjectId: projectId, capabilities: verified.capabilities ?? [] } } })
    await tx.connectionCredential.upsert({ where: { connectionId: connection.id }, create: { projectId: context.project.id, connectionId: connection.id, provider: 'hermes', encryptedPayload: encryptHermesCredential({ agentId, connectionId: registered.connectionId, projectId, connectionSecret }), status: ConnectionCredentialStatus.ACTIVE }, update: { encryptedPayload: encryptHermesCredential({ agentId, connectionId: registered.connectionId, projectId, connectionSecret }), status: ConnectionCredentialStatus.ACTIVE } })
    await recordAuditEvent({ projectId: context.project.id, eventType: 'hermes.connection.verified', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectConnection', targetId: connection.id, projectToolId: projectTool.id, summary: 'Hermes installation connection verified', metadata: { capabilities: verified.capabilities ?? [], environment: 'staging' } }, tx)
    return { connectionId: connection.id, capabilities: verified.capabilities ?? [] }
  })
  return result
}

/** Removes RogerOS access immediately. Hermes registration is left inert server-side. */
export async function disconnectHermesConnection(context: ProjectContext) {
  if (context.project.role !== 'OWNER' && context.project.role !== 'ADMIN') throw new HermesConnectionError('FORBIDDEN')
  const member = await prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } })
  const connection = await prisma.projectConnection.findFirst({ where: { projectId: context.project.id, projectTool: { tool: { key: 'hermes-runtime' } } }, select: { id: true, projectToolId: true } })
  if (!connection || !member) return { disconnected: false }
  await prisma.$transaction(async tx => {
    await tx.connectionCredential.deleteMany({ where: { connectionId: connection.id } })
    await tx.projectConnection.update({ where: { id: connection.id }, data: { status: ConnectionStatus.DISCONNECTED, enabled: false, credentialRef: null } })
    await recordAuditEvent({ projectId: context.project.id, eventType: 'hermes.connection.disconnected', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'ProjectConnection', targetId: connection.id, projectToolId: connection.projectToolId, summary: 'Hermes connection disconnected', metadata: {} }, tx)
  })
  return { disconnected: true }
}
