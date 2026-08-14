import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

const suffix = randomUUID().replaceAll('-', '')

test('M4 conversations, messages, and threads are isolated by project and participant', async (t) => {
  const org = await prisma.organization.create({ data: { name: `M4 ${suffix}`, slug: `m4-${suffix}` } })
  const [owner, outsider] = await Promise.all([prisma.user.create({ data: { email: `m4-owner-${suffix}@example.invalid` } }), prisma.user.create({ data: { email: `m4-outsider-${suffix}@example.invalid` } })])
  const [ownerMember, outsiderMember] = await Promise.all([prisma.organizationMember.create({ data: { userId: owner.id, organizationId: org.id, role: 'OWNER' } }), prisma.organizationMember.create({ data: { userId: outsider.id, organizationId: org.id, role: 'VIEWER' } })])
  const [vhalam, buddhaji] = await Promise.all([prisma.project.create({ data: { organizationId: org.id, name: 'Vhalam', slug: `v-${suffix}` } }), prisma.project.create({ data: { organizationId: org.id, name: 'Buddhaji', slug: `b-${suffix}` } })])
  await prisma.projectMember.createMany({ data: [{ projectId: vhalam.id, organizationId: org.id, organizationMemberId: ownerMember.id, role: 'OWNER' }, { projectId: buddhaji.id, organizationId: org.id, organizationMemberId: outsiderMember.id, role: 'VIEWER' }] })
  t.after(async () => { await prisma.organization.delete({ where: { id: org.id } }); await prisma.user.deleteMany({ where: { id: { in: [owner.id, outsider.id] } } }); await prisma.$disconnect() })
  const [vGeneral, bGeneral] = await Promise.all([prisma.conversation.create({ data: { projectId: vhalam.id, type: 'CHANNEL', slug: 'general', title: 'General', participants: { create: { userId: owner.id } } } }), prisma.conversation.create({ data: { projectId: buddhaji.id, type: 'CHANNEL', slug: 'general', title: 'General', participants: { create: { userId: outsider.id } } } })])
  const vMessage = await prisma.message.create({ data: { projectId: vhalam.id, conversationId: vGeneral.id, authorUserId: owner.id, body: 'Vhalam topic' } })
  const thread = await prisma.thread.create({ data: { projectId: vhalam.id, conversationId: vGeneral.id, rootMessageId: vMessage.id } })
  const reply = await prisma.message.create({ data: { projectId: vhalam.id, conversationId: vGeneral.id, threadId: thread.id, authorUserId: owner.id, body: 'Thread reply' } })
  assert.equal((await prisma.conversation.findMany({ where: { projectId: vhalam.id } })).map(c => c.id).includes(bGeneral.id), false)
  assert.equal(await prisma.message.findFirst({ where: { id: vMessage.id, projectId: buddhaji.id } }), null)
  assert.equal(await prisma.thread.findFirst({ where: { id: thread.id, projectId: buddhaji.id } }), null)
  assert.equal(reply.projectId, vhalam.id); assert.equal(reply.conversationId, vGeneral.id); assert.equal(reply.threadId, thread.id)
  await assert.rejects(prisma.message.create({ data: { projectId: vhalam.id, conversationId: bGeneral.id, body: 'cross project' } }), (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003')
  const unthreadedMessage = await prisma.message.create({ data: { projectId: vhalam.id, conversationId: vGeneral.id, authorUserId: owner.id, body: 'Another Vhalam topic' } })
  await assert.rejects(prisma.thread.create({ data: { projectId: vhalam.id, conversationId: bGeneral.id, rootMessageId: unthreadedMessage.id } }), (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003')
  const inaccessibleDirect = await prisma.conversation.create({ data: { projectId: vhalam.id, type: 'DIRECT', participants: { create: { userId: owner.id } } } })
  assert.equal(await prisma.conversation.findFirst({ where: { id: inaccessibleDirect.id, projectId: vhalam.id, participants: { some: { userId: outsider.id } } } }), null)
})
