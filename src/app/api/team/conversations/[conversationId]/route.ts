import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'
import { requireConversationAccess, teamErrorResponse } from '@/lib/team'

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const context = await requireProjectContextForRequest(request); const { conversationId } = await params
    const conversation = await requireConversationAccess(context, conversationId)
    const messages = await prisma.message.findMany({ where: { projectId: context.project.id, conversationId }, include: { author: { select: { name: true, email: true } }, rootForThread: { select: { id: true, status: true, _count: { select: { replies: true } } } } }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ conversation, messages })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForRequest(request); const { conversationId } = await params
    await requireConversationAccess(context, conversationId)
    const text = typeof body.body === 'string' ? body.body.trim().slice(0, 10000) : ''
    if (!text) return NextResponse.json({ error: 'A message is required' }, { status: 400 })
    const message = await prisma.message.create({ data: { projectId: context.project.id, conversationId, authorUserId: context.user.id, body: text } })
    return NextResponse.json({ message }, { status: 201 })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}
