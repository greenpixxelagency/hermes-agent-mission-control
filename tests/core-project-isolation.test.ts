import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { Prisma } from '@prisma/client'

import { isInternalServiceBypassAllowed, isSignedRuntimeCallbackPath } from '../src/lib/internal-service-auth'
import { ProjectContextError, requireAuthenticatedUserId, toProjectContext } from '../src/lib/project-context'
import { prisma } from '../src/lib/prisma'

const suffix = randomUUID().replaceAll('-', '')

test('M2 core execution records are isolated by project', async (t) => {
  const userA = await prisma.user.create({ data: { email: `m2-vhalam-${suffix}@example.invalid` } })
  const userB = await prisma.user.create({ data: { email: `m2-buddhaji-${suffix}@example.invalid` } })
  const organization = await prisma.organization.create({ data: { name: `M2 Test ${suffix}`, slug: `m2-test-${suffix}` } })
  const memberA = await prisma.organizationMember.create({ data: { userId: userA.id, organizationId: organization.id, role: 'OWNER' } })
  const memberB = await prisma.organizationMember.create({ data: { userId: userB.id, organizationId: organization.id, role: 'VIEWER' } })
  const vhalam = await prisma.project.create({ data: { organizationId: organization.id, name: 'Vhalam', slug: `vhalam-${suffix}` } })
  const buddhaji = await prisma.project.create({ data: { organizationId: organization.id, name: 'Buddhaji', slug: `buddhaji-${suffix}` } })
  await prisma.projectMember.createMany({ data: [
    { projectId: vhalam.id, organizationMemberId: memberA.id, organizationId: organization.id, role: 'OWNER' },
    { projectId: buddhaji.id, organizationMemberId: memberB.id, organizationId: organization.id, role: 'VIEWER' },
  ] })

  t.after(async () => {
    await prisma.organization.delete({ where: { id: organization.id } })
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
    await prisma.$disconnect()
  })

  const [vRequest, bRequest] = await Promise.all([
    prisma.agentRequest.create({ data: { projectId: vhalam.id, title: 'Vhalam request' } }),
    prisma.agentRequest.create({ data: { projectId: buddhaji.id, title: 'Buddhaji request' } }),
  ])
  await prisma.agentEvent.createMany({ data: [
    { projectId: vhalam.id, agentRequestId: vRequest.id, title: 'Vhalam event' },
    { projectId: buddhaji.id, agentRequestId: bRequest.id, title: 'Buddhaji event' },
  ] })
  await prisma.hermesTask.createMany({ data: [
    { projectId: vhalam.id, id: 'shared-task', title: 'Vhalam task' },
    { projectId: buddhaji.id, id: 'shared-task', title: 'Buddhaji task' },
  ] })
  await prisma.hermesMemory.createMany({ data: [
    { projectId: vhalam.id, id: 'shared-memory', path: 'facts/shared.md', title: 'Vhalam memory', tags: [], links: [] },
    { projectId: buddhaji.id, id: 'shared-memory', path: 'facts/shared.md', title: 'Buddhaji memory', tags: [], links: [] },
  ] })
  await prisma.projectDataStore.createMany({ data: [
    { projectId: vhalam.id, namespace: 'hermes', key: 'health', data: { project: 'vhalam' } },
    { projectId: buddhaji.id, namespace: 'hermes', key: 'health', data: { project: 'buddhaji' } },
  ] })

  assert.equal((await prisma.agentRequest.findMany({ where: { projectId: vhalam.id } })).length, 1)
  assert.equal(await prisma.agentRequest.findFirst({ where: { id: bRequest.id, projectId: vhalam.id } }), null)
  assert.equal((await prisma.agentEvent.findMany({ where: { projectId: buddhaji.id } })).every(event => event.title.includes('Buddhaji')), true)
  assert.equal(await prisma.hermesTask.findUnique({ where: { projectId_id: { projectId: vhalam.id, id: 'shared-task' } } }).then(task => task?.title), 'Vhalam task')
  assert.equal(await prisma.hermesMemory.findUnique({ where: { projectId_id: { projectId: vhalam.id, id: 'shared-memory' } } }).then(memory => memory?.title), 'Vhalam memory')
  assert.deepEqual((await prisma.projectDataStore.findUnique({ where: { projectId_namespace_key: { projectId: vhalam.id, namespace: 'hermes', key: 'health' } } }))?.data, { project: 'vhalam' })
  assert.deepEqual((await prisma.projectDataStore.findUnique({ where: { projectId_namespace_key: { projectId: buddhaji.id, namespace: 'hermes', key: 'health' } } }))?.data, { project: 'buddhaji' })

  await assert.rejects(
    prisma.projectDataStore.create({ data: { projectId: vhalam.id, namespace: 'hermes', key: 'health', data: {} } }),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
  )
  assert.throws(() => toProjectContext({ id: userA.id, email: userA.email! }, null), (error: unknown) => error instanceof ProjectContextError && error.status === 404)
  assert.throws(() => requireAuthenticatedUserId(null), (error: unknown) => error instanceof ProjectContextError && error.status === 401)
  assert.equal(isInternalServiceBypassAllowed('/api/hermes/requests'), false)
  assert.equal(isInternalServiceBypassAllowed('/api/cron/x-stats'), true)
  assert.equal(isSignedRuntimeCallbackPath('/api/runtime/callback'), true)
  assert.equal(isSignedRuntimeCallbackPath('/api/runtime/callback/other'), false)
})
