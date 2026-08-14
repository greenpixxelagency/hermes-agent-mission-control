import { NextResponse } from 'next/server'

import { ProjectContextError, requireProjectContext } from '@/lib/project-context'

export async function requireProjectContextForRequest(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId')
  return requireProjectContext(projectId ?? '')
}

export async function requireProjectContextForBody(body: Record<string, unknown>) {
  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  return requireProjectContext(projectId)
}

export function projectScopeErrorResponse(error: unknown) {
  if (error instanceof ProjectContextError) {
    return NextResponse.json(
      { error: error.code === 'UNAUTHENTICATED' ? 'Unauthorized' : 'Not found' },
      { status: error.status },
    )
  }
  throw error
}
