import { ThreadStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'
import { requireThreadAccess, teamErrorResponse } from '@/lib/team'

export async function GET(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const context = await requireProjectContextForRequest(request); const { threadId } = await params; const thread = await requireThreadAccess(context, threadId)
    const replies = await prisma.message.findMany({ where: { projectId: context.project.id, threadId }, include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ thread, replies })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body); const { threadId } = await params; const thread = await requireThreadAccess(context, threadId)
    const text = typeof body.body === 'string' ? body.body.trim().slice(0, 10000) : ''
    if (!text) return NextResponse.json({ error: 'A reply is required' }, { status: 400 })
    const reply = await prisma.message.create({ data: { projectId: context.project.id, conversationId: thread.conversationId, threadId, authorUserId: context.user.id, body: text } })
    return NextResponse.json({ reply }, { status: 201 })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body); const { threadId } = await params; await requireThreadAccess(context, threadId)
    const status = body.status === 'OPEN' || body.status === 'RESOLVED' || body.status === 'ARCHIVED' ? body.status as ThreadStatus : null
    if (!status) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    const thread = await prisma.thread.update({ where: { id_projectId: { id: threadId, projectId: context.project.id } }, data: { status } })
    return NextResponse.json({ thread })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}
