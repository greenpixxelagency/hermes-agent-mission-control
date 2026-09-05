import { NextResponse } from 'next/server'

import { DriveWorkspaceError, getDriveWorkspace, runHumanDriveWorkspaceAction } from '@/lib/drive-workspace'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

function response(error: unknown) {
  if (error instanceof DriveWorkspaceError) return NextResponse.json({ error: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'DRIVE_UNINSTALLED' ? 404 : error.code === 'INVALID_DRIVE_REQUEST' ? 400 : 409 })
  return projectScopeErrorResponse(error)
}

export async function GET(request: Request) {
  try { return NextResponse.json(await getDriveWorkspace(await requireProjectContextForRequest(request))) }
  catch (error) { return response(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    return NextResponse.json(await runHumanDriveWorkspaceAction(await requireProjectContextForBody(body), body))
  } catch (error) { return response(error) }
}
