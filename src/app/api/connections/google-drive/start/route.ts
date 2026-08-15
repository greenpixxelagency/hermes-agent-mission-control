import { NextResponse } from 'next/server'
import { beginDriveOAuth } from '@/lib/drive-oauth'
import { isDriveOAuthConfigured } from '@/lib/drive-crypto'
import { canManageToolPermissions } from '@/lib/tool-permission-rules'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    if (!canManageToolPermissions(context.project.role)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
    if (!isDriveOAuthConfigured()) return NextResponse.json({ error: 'DRIVE_OAUTH_NOT_CONFIGURED' }, { status: 503 })
    const origin = new URL(request.url).origin
    return NextResponse.json({ authorizationUrl: await beginDriveOAuth({ projectId: context.project.id, userId: context.user.id, origin }) })
  } catch (error) { return projectScopeErrorResponse(error) }
}
