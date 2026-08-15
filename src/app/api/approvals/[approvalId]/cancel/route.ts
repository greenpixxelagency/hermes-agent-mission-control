import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cancelApprovalRequest } from '@/lib/approvals'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request, { params }: { params: Promise<{ approvalId: string }> }) { try { const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body); const { approvalId } = await params; const member = await prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } }); if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 }); await cancelApprovalRequest({ projectId: context.project.id, approvalId, requesterProjectMemberId: member.id }); return NextResponse.json({ cancelled: true }) } catch (error) { if (error instanceof Error && error.message === 'NOT_FOUND_OR_NOT_CANCELLABLE') return NextResponse.json({ error: 'Approval is not available for cancellation' }, { status: 409 }); return projectScopeErrorResponse(error) } }
