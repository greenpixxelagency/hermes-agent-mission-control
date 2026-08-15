import { NextResponse } from 'next/server'
import { DriveScopeType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { canManageToolPermissions } from '@/lib/tool-permission-rules'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) { try { const context = await requireProjectContextForRequest(request); return NextResponse.json({ scopes: await prisma.projectConnectionScope.findMany({ where: { projectId: context.project.id }, orderBy: { displayName: 'asc' } }) }) } catch (error) { return projectScopeErrorResponse(error) } }
export async function POST(request: Request) { try {
  const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
  if (!canManageToolPermissions(context.project.role)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const connectionId = typeof body.connectionId === 'string' ? body.connectionId : ''; const externalId = typeof body.externalId === 'string' ? body.externalId.trim() : ''; const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 240) : ''; const type = body.type === 'FILE' ? DriveScopeType.FILE : body.type === 'FOLDER' ? DriveScopeType.FOLDER : null
  if (!connectionId || !externalId || !displayName || !type) return NextResponse.json({ error: 'INVALID_SCOPE' }, { status: 400 })
  if (!await prisma.projectConnection.findFirst({ where: { id: connectionId, projectId: context.project.id, projectTool: { tool: { key: 'google_drive' } } } })) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json({ scope: await prisma.projectConnectionScope.upsert({ where: { connectionId_type_externalId: { connectionId, type, externalId } }, create: { projectId: context.project.id, connectionId, type, externalId, displayName, parentExternalId: typeof body.parentExternalId === 'string' ? body.parentExternalId.slice(0, 240) : null }, update: { displayName } }) }, { status: 201 })
} catch (error) { return projectScopeErrorResponse(error) } }
