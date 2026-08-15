import { NextResponse } from 'next/server'

import { getHermesExecution } from '@/lib/hermes-runtime'
import { runtimeErrorResponse, safeExecution } from '@/lib/hermes-runtime-api'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request, { params }: { params: Promise<{ executionId: string }> }) {
  try {
    const context = await requireProjectContextForRequest(request)
    const { executionId } = await params
    return NextResponse.json({ execution: safeExecution(await getHermesExecution(context, executionId)) })
  } catch (error) {
    try { return projectScopeErrorResponse(error) } catch (scopeError) { return runtimeErrorResponse(scopeError) }
  }
}
