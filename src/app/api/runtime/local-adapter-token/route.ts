import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { requireProjectContextForBody } from '@/lib/project-scope'
import { projectScopeErrorResponse } from '@/lib/project-scope'
import { hermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'

const TOKEN_ENV = 'ROGEROS_HERMES_STAGING_ADAPTER_TOKEN'

function persistLocalToken(token: string) {
  const envPath = path.join(process.cwd(), '.env.local')
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const line = `${TOKEN_ENV}=${JSON.stringify(token)}`
  const matcher = new RegExp(`^${TOKEN_ENV}=.*$`, 'm')
  const next = matcher.test(current)
    ? current.replace(matcher, line)
    : `${current}${current && !current.endsWith('\n') ? '\n' : ''}${line}\n`
  fs.writeFileSync(envPath, next, { encoding: 'utf8', mode: 0o600 })
}

/** Development-only bridge for the ignored local environment file; never enabled in production. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'Not available' }, { status: 404 })
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    if (context.project.role !== 'OWNER' && context.project.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (token.length < 32 || token.length > 512) return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    process.env[TOKEN_ENV] = token
    try {
      const [health, inventory, claims] = await Promise.all([
        hermesRuntimeAdapter.health(),
        hermesRuntimeAdapter.listProjectBots(context.project.id),
        hermesRuntimeAdapter.listClaimableProfiles(),
      ])
      if (!health.hermesReachable) throw new Error('HERMES_ADAPTER_503_HEALTH')
      persistLocalToken(token)
      return NextResponse.json({ ok: true, adapter: { healthy: true, runtimeIdentity: health.runtimeIdentity, botCount: inventory.length, claimableCount: claims.length } })
    } catch (error) {
      const code = error instanceof Error && /^HERMES_ADAPTER_[A-Z0-9_]+$/.test(error.message) ? error.message : 'ADAPTER_CHECK_FAILED'
      return NextResponse.json({ ok: true, adapter: { healthy: false, botCount: 0, claimableCount: 0, error: code } })
    }
  } catch (error) { return projectScopeErrorResponse(error) }
}
