import { NextResponse } from 'next/server'
import { disconnectDriveConnection } from '@/lib/drive-oauth'
import { canManageToolPermissions } from '@/lib/tool-permission-rules'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request) { try {
  const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
  if (!canManageToolPermissions(context.project.role)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId : ''
  if (!connectionId) return NextResponse.json({ error: 'INVALID_CONNECTION' }, { status: 400 })
  return NextResponse.json({ connection: await disconnectDriveConnection(context.project.id, connectionId) })
} catch (error) { return projectScopeErrorResponse(error) } }
