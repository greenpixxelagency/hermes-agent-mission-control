import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'
import { requireConversationAccess, teamErrorResponse } from '@/lib/team'

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : ''
    const rootMessageId = typeof body.rootMessageId === 'string' ? body.rootMessageId : ''
    await requireConversationAccess(context, conversationId)
    const root = await prisma.message.findFirst({ where: { id: rootMessageId, projectId: context.project.id, conversationId, threadId: null } })
    if (!root) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const existing = await prisma.thread.findFirst({ where: { projectId: context.project.id, rootMessageId } })
    if (existing) return NextResponse.json({ thread: existing })
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : ''
    const thread = await prisma.thread.create({ data: { projectId: context.project.id, conversationId, rootMessageId, title: title || null } })
    return NextResponse.json({ thread }, { status: 201 })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}
