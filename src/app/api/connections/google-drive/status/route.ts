import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isDriveOAuthConfigured } from '@/lib/drive-crypto'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) { try {
  const context = await requireProjectContextForRequest(request)
  const connection = await prisma.projectConnection.findFirst({ where: { projectId: context.project.id, projectTool: { tool: { key: 'google_drive' } } }, include: { credential: { select: { status: true, accountEmail: true, accountDisplayName: true, expiresAt: true } }, scopes: { where: { active: true }, select: { id: true, type: true, externalId: true, displayName: true } } } })
  return NextResponse.json({ configured: isDriveOAuthConfigured(), connection })
} catch (error) { return projectScopeErrorResponse(error) } }
