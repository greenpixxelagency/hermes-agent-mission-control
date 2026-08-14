import { ConversationType } from '@prisma/client'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'
import { conversationListInclude, teamErrorResponse } from '@/lib/team'

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const conversations = await prisma.conversation.findMany({ where: { projectId: context.project.id, archivedAt: null, participants: { some: { userId: context.user.id } } }, include: conversationListInclude, orderBy: { updatedAt: 'desc' } })
    return NextResponse.json({ conversations })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    const type = body.type === 'DIRECT' || body.type === 'GROUP' || body.type === 'CHANNEL' ? body.type as ConversationType : 'GROUP'
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : ''
    if ((type === 'GROUP' || type === 'CHANNEL') && !title) return NextResponse.json({ error: 'A title is required' }, { status: 400 })
    const conversation = await prisma.conversation.create({ data: { projectId: context.project.id, type, title: title || null, createdById: context.user.id, participants: { create: { userId: context.user.id } } }, include: conversationListInclude })
    return NextResponse.json({ conversation }, { status: 201 })
  } catch (error) { try { return projectScopeErrorResponse(error) } catch (inner) { return teamErrorResponse(inner) } }
}
