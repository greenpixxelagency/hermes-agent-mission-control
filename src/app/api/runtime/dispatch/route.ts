import { NextResponse } from 'next/server'

import { dispatchTaskToHermes } from '@/lib/hermes-runtime'
import { runtimeErrorResponse, safeExecution } from '@/lib/hermes-runtime-api'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    const taskId = typeof body.taskId === 'string' ? body.taskId : ''
    if (!taskId) return NextResponse.json({ error: 'TASK_NOT_FOUND' }, { status: 404 })
    return NextResponse.json({ execution: safeExecution(await dispatchTaskToHermes(context, taskId)) }, { status: 201 })
  } catch (error) {
    try { return projectScopeErrorResponse(error) } catch (scopeError) { return runtimeErrorResponse(scopeError) }
  }
}
