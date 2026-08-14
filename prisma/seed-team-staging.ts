import { ConversationType, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = (process.env.ALLOWED_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase()).find(Boolean)
  if (!email) throw new Error('ALLOWED_EMAILS is required for the staging Team bootstrap')
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  for (const slug of ['vhalam', 'buddhaji']) {
    const project = await prisma.project.findFirstOrThrow({ where: { slug } })
    const upsertConversation = async (type: ConversationType, conversationSlug: string, title: string | null, systemIdentity?: string) => {
      const conversation = await prisma.conversation.upsert({ where: { projectId_slug: { projectId: project.id, slug: conversationSlug } }, create: { projectId: project.id, type, slug: conversationSlug, title, createdById: user.id }, update: { title } })
      await prisma.conversationParticipant.upsert({ where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } }, create: { projectId: project.id, conversationId: conversation.id, userId: user.id }, update: {} })
      if (systemIdentity) await prisma.conversationParticipant.upsert({ where: { conversationId_systemIdentity: { conversationId: conversation.id, systemIdentity } }, create: { projectId: project.id, conversationId: conversation.id, systemIdentity }, update: {} })
    }
    await upsertConversation('CHANNEL', 'general', 'General')
    await upsertConversation('DIRECT', 'chief-of-staff', null, 'chief-of-staff')
  }
}
main().finally(() => prisma.$disconnect())
