import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ConnectionCredentialStatus, ConnectionStatus, ProjectToolStatus } from '@prisma/client'
import { decryptHermesCredential, encryptHermesCredential } from '@/lib/hermes-connection'
import { requireProjectContextForRequest } from '@/lib/project-scope'

const base = () => (process.env.HERMES_PUBLIC_URL || 'https://hermes-agent-nqqk.srv1899670.hstgr.cloud').replace(/\/$/, '')
export async function GET(request: NextRequest) {
  const url = new URL(request.url); const state = url.searchParams.get('state'); const code = url.searchParams.get('code')
  if (!state || !code) return NextResponse.redirect(new URL('/login', request.url))
  let flow: { verifier: string; projectId: string; issuedAt: number }; try { flow = decryptHermesCredential(state) } catch { return NextResponse.redirect(new URL('/login', request.url)) }
  if (Date.now() - flow.issuedAt > 600000) return NextResponse.redirect(new URL('/login', request.url))
  const context = await requireProjectContextForRequest(new Request(new URL(`/api/hermes/callback?projectId=${encodeURIComponent(flow.projectId)}`, request.url)))
  const exchange = await fetch(`${base()}/auth/native/token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: flow.verifier }), cache: 'no-store' })
  if (!exchange.ok) return NextResponse.redirect(new URL(`/p/${context.project.slug}/settings?hermes=failed`, request.url))
  const tokens = await exchange.json() as { access_token: string; refresh_token?: string; expires_at?: number; user_id?: string }
  const tool = await prisma.toolDefinition.upsert({ where: { key: 'hermes-runtime' }, create: { key: 'hermes-runtime', name: 'Hermes runtime', description: 'Governed Hermes execution runtime' }, update: {} })
  const projectTool = await prisma.projectTool.upsert({ where: { projectId_toolDefinitionId: { projectId: context.project.id, toolDefinitionId: tool.id } }, create: { projectId: context.project.id, toolDefinitionId: tool.id, status: ProjectToolStatus.CONNECTED }, update: { status: ProjectToolStatus.CONNECTED } })
  const connection = await prisma.projectConnection.upsert({ where: { projectId_projectToolId: { projectId: context.project.id, projectToolId: projectTool.id } }, create: { projectId: context.project.id, projectToolId: projectTool.id, name: 'Hermes Agent', status: ConnectionStatus.CONNECTED, enabled: true, metadata: { auth: 'native_pkce', userId: tokens.user_id ?? null } }, update: { status: ConnectionStatus.CONNECTED, enabled: true, metadata: { auth: 'native_pkce', userId: tokens.user_id ?? null } } })
  await prisma.connectionCredential.upsert({ where: { connectionId: connection.id }, create: { projectId: context.project.id, connectionId: connection.id, provider: 'hermes_oauth', encryptedPayload: encryptHermesCredential(tokens), status: ConnectionCredentialStatus.ACTIVE }, update: { encryptedPayload: encryptHermesCredential(tokens), status: ConnectionCredentialStatus.ACTIVE } })
  return NextResponse.redirect(new URL(`/p/${context.project.slug}/settings?hermes=connected`, request.url))
}
