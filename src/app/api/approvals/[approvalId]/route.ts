import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request, { params }: { params: Promise<{ approvalId: string }> }) { try { const context = await requireProjectContextForRequest(request); const { approvalId } = await params; const approval = await prisma.approvalRequest.findFirst({ where: { id: approvalId, projectId: context.project.id }, include: { auditEvents: { orderBy: { createdAt: 'asc' } }, projectTool: { include: { tool: true } }, requestedByEmployee: { include: { employee: true } }, task: true } }); if (!approval) return NextResponse.json({ error: 'Not found' }, { status: 404 }); return NextResponse.json({ approval }) } catch (error) { return projectScopeErrorResponse(error) } }
