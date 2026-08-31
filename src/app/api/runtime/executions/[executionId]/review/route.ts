import { NextResponse } from 'next/server'
import { reviewHermesExecution } from '@/lib/hermes-runtime'
import { runtimeErrorResponse, safeExecution } from '@/lib/hermes-runtime-api'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request, { params }: { params: Promise<{ executionId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
    const action = body.action === 'ACCEPT' || body.action === 'REQUEST_REVISION' ? body.action : null
    if (!action) return NextResponse.json({ error: 'INVALID_REVIEW_ACTION' }, { status: 400 })
    const { executionId } = await params
    return NextResponse.json({ execution: safeExecution(await reviewHermesExecution(context, executionId, action, typeof body.note === 'string' ? body.note : undefined)) })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (scopeError) { return runtimeErrorResponse(scopeError) } }
}
