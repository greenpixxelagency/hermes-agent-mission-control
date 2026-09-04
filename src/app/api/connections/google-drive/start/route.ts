import { NextResponse } from 'next/server'
import { beginDriveOAuth } from '@/lib/drive-oauth'
import { isDriveOAuthConfigured } from '@/lib/drive-crypto'
import { canManageToolPermissions } from '@/lib/tool-permission-rules'
import { AppMarketError, markAppInstallationConnecting } from '@/lib/app-market'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    if (!canManageToolPermissions(context.project.role)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    if (!isDriveOAuthConfigured()) return NextResponse.json({ error: 'DRIVE_OAUTH_NOT_CONFIGURED' }, { status: 503 })
    const installationId = typeof body.installationId === 'string' ? body.installationId : ''
    if (installationId) await markAppInstallationConnecting(context, installationId)
    const origin = new URL(request.url).origin
    return NextResponse.json({ authorizationUrl: await beginDriveOAuth({ projectId: context.project.id, userId: context.user.id, origin }) })
  } catch (error) {
    if (error instanceof AppMarketError) return NextResponse.json({ error: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'INSTALLATION_NOT_FOUND' ? 404 : 400 })
    return projectScopeErrorResponse(error)
  }
}
