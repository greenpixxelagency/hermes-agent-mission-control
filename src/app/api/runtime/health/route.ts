import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { decryptHermesCredential } from '@/lib/hermes-connection'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const connection = await prisma.projectConnection.findFirst({ where: { projectId: context.project.id, enabled: true, status: 'CONNECTED', projectTool: { tool: { key: 'hermes-runtime' } } }, include: { credential: true } })
    const unavailable = { healthy: false, hermesVersion: null, runtimeIdentity: null, checkedAt: new Date().toISOString() }
    if (!connection?.credential || connection.credential.provider !== 'hermes_oauth' || connection.credential.status !== 'ACTIVE') return NextResponse.json(unavailable)
    try {
      const tokens = decryptHermesCredential<{ access_token: string }>(connection.credential.encryptedPayload)
      const base = (process.env.HERMES_PUBLIC_URL || 'https://hermes-agent-nqqk.srv1899670.hstgr.cloud').replace(/\/$/, '')
      const options = { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store' as const, redirect: 'error' as const, signal: AbortSignal.timeout(15000) }
      const identityResponse = await fetch(`${base}/api/auth/me`, options)
      if (!identityResponse.ok) return NextResponse.json(unavailable)
      const identity = await identityResponse.json() as { user_id?: string }
      if (!identity.user_id) return NextResponse.json(unavailable)
      const profilesResponse = await fetch(`${base}/api/profiles`, options)
      if (!profilesResponse.ok) return NextResponse.json(unavailable)
      const inventory = await profilesResponse.json() as { profiles?: unknown[] }
      if (!Array.isArray(inventory.profiles)) return NextResponse.json(unavailable)
      return NextResponse.json({ healthy: true, hermesVersion: null, runtimeIdentity: 'Hermes Agent', profileCount: inventory.profiles.length, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
    } catch { return NextResponse.json(unavailable) }
  } catch (error) {
    return projectScopeErrorResponse(error)
  }
}
