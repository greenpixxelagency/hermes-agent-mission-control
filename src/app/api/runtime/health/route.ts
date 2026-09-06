import { NextResponse } from 'next/server'

import { hermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) {
  try {
    await requireProjectContextForRequest(request)
    let health
    try { health = await hermesRuntimeAdapter.health() }
    catch {
      const response = await fetch('https://rogeros-hermes-staging-adapter.srv1899670.hstgr.cloud/health', { cache: 'no-store' })
      if (!response.ok) throw new Error('HERMES_HEALTH_UNAVAILABLE')
      health = await response.json() as { adapter: string; hermesReachable: boolean; hermesVersion?: string; runtimeIdentity: string; timestamp: string }
    }
    return NextResponse.json({ healthy: health.adapter === 'ok' && health.hermesReachable, hermesVersion: health.hermesVersion, runtimeIdentity: health.runtimeIdentity, checkedAt: health.timestamp })
  } catch (error) {
    return projectScopeErrorResponse(error)
  }
}
