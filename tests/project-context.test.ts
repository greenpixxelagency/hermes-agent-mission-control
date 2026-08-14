import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'

import { ProjectContextError, requireAuthenticatedUserId, toProjectContext } from '../src/lib/project-context'
import { prisma } from '../src/lib/prisma'

const runId = randomUUID()
const suffix = runId.replaceAll('-', '')
const userAEmail = `m1-test-a-${suffix}@example.invalid`
const userBEmail = `m1-test-b-${suffix}@example.invalid`

test('M1 project access requires explicit project membership', async (t) => {
  const userA = await prisma.user.create({ data: { email: userAEmail } })
  const userB = await prisma.user.create({ data: { email: userBEmail } })
  const organization = await prisma.organization.create({
    data: { name: `M1 Test ${suffix}`, slug: `m1-test-${suffix}` },
  })
  const memberA = await prisma.organizationMember.create({
    data: { userId: userA.id, organizationId: organization.id, role: 'OWNER' },
  })
  const memberB = await prisma.organizationMember.create({
    data: { userId: userB.id, organizationId: organization.id, role: 'VIEWER' },
  })
  const otherOrganization = await prisma.organization.create({
    data: { name: `M1 Other ${suffix}`, slug: `m1-other-${suffix}` },
  })
  const otherMember = await prisma.organizationMember.create({
    data: { userId: userB.id, organizationId: otherOrganization.id, role: 'VIEWER' },
  })
  const vhalam = await prisma.project.create({
    data: { organizationId: organization.id, name: 'Vhalam', slug: `vhalam-${suffix}` },
  })
  const buddhaji = await prisma.project.create({
    data: { organizationId: organization.id, name: 'Buddhaji', slug: `buddhaji-${suffix}` },
  })
  await prisma.projectMember.create({
    data: { projectId: vhalam.id, organizationMemberId: memberA.id, organizationId: organization.id, role: 'OWNER' },
  })
  await prisma.projectMember.create({
    data: { projectId: buddhaji.id, organizationMemberId: memberA.id, organizationId: organization.id, role: 'OWNER' },
  })

  t.after(async () => {
    await prisma.organization.delete({ where: { id: organization.id } })
    await prisma.organization.delete({ where: { id: otherOrganization.id } })
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } })
    await prisma.$disconnect()
  })

  const allowedMembership = await prisma.projectMember.findFirst({
    where: { projectId: vhalam.id, organizationMember: { userId: userA.id } },
    select: {
      role: true,
      project: { select: { id: true, name: true, slug: true } },
      organizationMember: {
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  })
  const context = toProjectContext({ id: userA.id, email: userAEmail }, allowedMembership)
  assert.equal(context.project.id, vhalam.id)
  assert.equal(context.project.role, 'OWNER')

  const deniedMembership = await prisma.projectMember.findFirst({
    where: { projectId: vhalam.id, organizationMember: { userId: userB.id } },
    select: {
      role: true,
      project: { select: { id: true, name: true, slug: true } },
      organizationMember: {
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  })
  assert.throws(
    () => toProjectContext({ id: userB.id, email: userBEmail }, deniedMembership),
    (error: unknown) => error instanceof ProjectContextError && error.code === 'PROJECT_NOT_FOUND',
  )

  assert.throws(
    () => requireAuthenticatedUserId(null),
    (error: unknown) => error instanceof ProjectContextError && error.code === 'UNAUTHENTICATED',
  )
  assert.throws(
    () => toProjectContext({ id: userA.id, email: userAEmail }, null),
    (error: unknown) => error instanceof ProjectContextError && error.status === 404,
  )

  await assert.rejects(
    prisma.organizationMember.create({ data: { userId: userA.id, organizationId: organization.id, role: 'OWNER' } }),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
  )
  await assert.rejects(
    prisma.projectMember.create({ data: { projectId: vhalam.id, organizationMemberId: memberA.id, organizationId: organization.id, role: 'OWNER' } }),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
  )

  await assert.rejects(
    prisma.projectMember.create({
      data: {
        projectId: vhalam.id,
        organizationMemberId: otherMember.id,
        organizationId: organization.id,
        role: 'VIEWER',
      },
    }),
    (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003',
  )

  assert.ok(memberB.id)
})
