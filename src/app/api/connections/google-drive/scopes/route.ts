import { NextResponse } from 'next/server'
import { DriveScopeType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { inspectGoogleDriveItem } from '@/lib/google-drive-adapter'
import { canManageToolPermissions } from '@/lib/tool-permission-rules'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) { try { const context = await requireProjectContextForRequest(request); return NextResponse.json({ scopes: await prisma.projectConnectionScope.findMany({ where: { projectId: context.project.id, active: true }, orderBy: { displayName: 'asc' } }) }) } catch (error) { return projectScopeErrorResponse(error) } }
export async function POST(request: Request) { try {
  const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
  if (!canManageToolPermissions(context.project.role)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId : ''; const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : ''; const type = body.type === 'FILE' ? DriveScopeType.FILE : body.type === 'FOLDER' ? DriveScopeType.FOLDER : null
  if (!connectionId || !externalId || !type || externalId.length > 240) return NextResponse.json({ error: 'INVALID_SCOPE' }, { status: 400 })
  const connection = await prisma.projectConnection.findFirst({ where: { id: connectionId, projectId: context.project.id, enabled: true, projectTool: { tool: { key: 'google_drive' } } } })
  if (!connection) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const item = await inspectGoogleDriveItem(context.project.id, connection.id, externalId).catch(() => null)
  if (!item || (type === DriveScopeType.FOLDER) !== item.mimeType.endsWith('.folder')) return NextResponse.json({ error: 'INVALID_DRIVE_ITEM' }, { status: 400 })
  return NextResponse.json({ scope: await prisma.projectConnectionScope.upsert({ where: { connectionId_type_externalId: { connectionId, type, externalId } }, create: { projectId: context.project.id, connectionId, type, externalId, displayName: item.name.slice(0, 240), parentExternalId: item.parents?.[0]?.slice(0, 240) ?? null }, update: { displayName: item.name.slice(0, 240), parentExternalId: item.parents?.[0]?.slice(0, 240) ?? null, active: true } }) }, { status: 201 })
} catch (error) { return projectScopeErrorResponse(error) } }
