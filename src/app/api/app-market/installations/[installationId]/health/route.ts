import { NextResponse } from 'next/server'

import { AppMarketError, checkAppInstallationHealth } from '@/lib/app-market'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request, { params }: { params: Promise<{ installationId: string }> }) {
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const { installationId } = await params
    return NextResponse.json(await checkAppInstallationHealth(await requireProjectContextForBody(body), installationId, request.headers.get('idempotency-key') ?? undefined))
  } catch (error) {
    if (error instanceof AppMarketError) return NextResponse.json({ error: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'INSTALLATION_NOT_FOUND' ? 404 : error.code === 'IDEMPOTENCY_KEY_REUSED' || error.code === 'IDEMPOTENCY_IN_PROGRESS' ? 409 : 400 })
    return projectScopeErrorResponse(error)
  }
}
