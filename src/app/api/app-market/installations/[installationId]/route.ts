import { AppInstallationStatus } from '@prisma/client'
import { NextResponse } from 'next/server'

import { AppMarketError, updateAppInstallationLifecycle } from '@/lib/app-market'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function PATCH(request: Request, { params }: { params: Promise<{ installationId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>
    const status = typeof body.status === 'string' && Object.values(AppInstallationStatus).includes(body.status as AppInstallationStatus) ? body.status as AppInstallationStatus : null
    if (!status) return NextResponse.json({ error: 'INVALID_LIFECYCLE_STATUS' }, { status: 400 })
    const { installationId } = await params
    return NextResponse.json({ installation: await updateAppInstallationLifecycle(await requireProjectContextForBody(body), installationId, status) })
  } catch (error) {
    if (error instanceof AppMarketError) return NextResponse.json({ error: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'INSTALLATION_NOT_FOUND' ? 404 : 400 })
    return projectScopeErrorResponse(error)
  }
}
