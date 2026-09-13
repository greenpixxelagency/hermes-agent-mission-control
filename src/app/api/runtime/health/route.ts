import { NextResponse } from 'next/server'

import { hermesAdapterConfigured, hermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) {
  try {
    await requireProjectContextForRequest(request)
    const unavailable = { healthy: false, hermesVersion: null, runtimeIdentity: null, checkedAt: new Date().toISOString() }
    if (!hermesAdapterConfigured()) return NextResponse.json(unavailable)
    try {
      const health = await hermesRuntimeAdapter.health()
      if (!health.hermesReachable) return NextResponse.json(unavailable)
      return NextResponse.json({ healthy: true, hermesVersion: health.hermesVersion || null, runtimeIdentity: health.runtimeIdentity || 'Hermes Agent', checkedAt: health.timestamp || new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } })
    } catch { return NextResponse.json(unavailable) }
  } catch (error) {
    return projectScopeErrorResponse(error)
  }
}
