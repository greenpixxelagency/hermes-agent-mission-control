import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) { try { const context = await requireProjectContextForRequest(request); const events = await prisma.auditEvent.findMany({ where: { projectId: context.project.id }, include: { actorProjectMember: { include: { organizationMember: { include: { user: true } } } }, actorEmployeeAssignment: { include: { employee: true } }, projectTool: { include: { tool: true } }, approvalRequest: true, task: true }, orderBy: { createdAt: 'desc' }, take: 200 }); return NextResponse.json({ events }) } catch (error) { return projectScopeErrorResponse(error) } }
