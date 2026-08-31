import { NextResponse } from 'next/server'
import { retryHermesExecution } from '@/lib/hermes-runtime'
import { runtimeErrorResponse, safeExecution } from '@/lib/hermes-runtime-api'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request, { params }: { params: Promise<{ executionId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body); const { executionId } = await params
    return NextResponse.json({ execution: safeExecution(await retryHermesExecution(context, executionId)) }, { status: 201 })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (scopeError) { return runtimeErrorResponse(scopeError) } }
}
