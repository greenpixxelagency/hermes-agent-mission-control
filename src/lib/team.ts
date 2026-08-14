import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ProjectContext } from '@/lib/project-context'

export class ConversationAccessError extends Error {
  constructor() { super('CONVERSATION_NOT_FOUND'); this.name = 'ConversationAccessError' }
}

export async function requireConversationAccess(context: ProjectContext, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, projectId: context.project.id, participants: { some: { userId: context.user.id } } },
    include: { participants: { include: { user: { select: { id: true, name: true, email: true } } } } },
  })
  if (!conversation) throw new ConversationAccessError()
  return conversation
}

export async function requireThreadAccess(context: ProjectContext, threadId: string) {
  const thread = await prisma.thread.findFirst({
    where: { id: threadId, projectId: context.project.id, conversation: { participants: { some: { userId: context.user.id } } } },
    include: { rootMessage: { include: { author: { select: { name: true, email: true } } } }, relatedTasks: { select: { id: true, title: true, status: true } } },
  })
  if (!thread) throw new ConversationAccessError()
  return thread
}

export function teamErrorResponse(error: unknown) {
  if (error instanceof ConversationAccessError) return Response.json({ error: 'Not found' }, { status: 404 })
  throw error
}

export const conversationListInclude = Prisma.validator<Prisma.ConversationInclude>()({
  participants: { include: { user: { select: { id: true, name: true, email: true } } } },
  _count: { select: { messages: true } },
})
