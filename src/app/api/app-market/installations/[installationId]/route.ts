import { NextResponse } from 'next/server'

import { AppMarketError, changeAppInstallationLifecycle, getProjectAppInstallation, isAppInstallationAction } from '@/lib/app-market'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request, { params }: { params: Promise<{ installationId: string }> }) {
  try {
    const { installationId } = await params
    return NextResponse.json({ installation: await getProjectAppInstallation(await requireProjectContextForRequest(request), installationId) })
  } catch (error) {
    if (error instanceof AppMarketError) return NextResponse.json({ error: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'INSTALLATION_NOT_FOUND' ? 404 : 400 })
    return projectScopeErrorResponse(error)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ installationId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>
    if (!isAppInstallationAction(body.action)) return NextResponse.json({ error: 'INVALID_LIFECYCLE_ACTION' }, { status: 400 })
    const { installationId } = await params
    return NextResponse.json(await changeAppInstallationLifecycle(await requireProjectContextForBody(body), installationId, body.action, request.headers.get('idempotency-key') ?? undefined))
  } catch (error) {
    if (error instanceof AppMarketError) return NextResponse.json({ error: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'INSTALLATION_NOT_FOUND' ? 404 : error.code === 'IDEMPOTENCY_KEY_REUSED' || error.code === 'IDEMPOTENCY_IN_PROGRESS' ? 409 : 400 })
    return projectScopeErrorResponse(error)
  }
}
