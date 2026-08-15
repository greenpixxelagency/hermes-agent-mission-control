import { NextResponse } from 'next/server'

import { hermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) {
  try {
    await requireProjectContextForRequest(request)
    const health = await hermesRuntimeAdapter.health()
    return NextResponse.json({ healthy: health.adapter === 'ok' && health.hermesReachable, hermesVersion: health.hermesVersion, runtimeIdentity: health.runtimeIdentity, checkedAt: health.timestamp })
  } catch (error) {
    return projectScopeErrorResponse(error)
  }
}
