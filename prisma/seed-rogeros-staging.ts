import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = (process.env.ALLOWED_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase()).find(Boolean)
  if (!email) throw new Error('ALLOWED_EMAILS is required for the staging RogerOS bootstrap')
  const user = await prisma.user.upsert({ where: { email }, create: { email }, update: {} })
  const organization = await prisma.organization.upsert({ where: { slug: 'green-pixxel' }, create: { name: 'Green Pixxel', slug: 'green-pixxel' }, update: { name: 'Green Pixxel' } })
  const member = await prisma.organizationMember.upsert({ where: { userId_organizationId: { userId: user.id, organizationId: organization.id } }, create: { userId: user.id, organizationId: organization.id, role: 'OWNER' }, update: { role: 'OWNER' } })
  for (const [name, slug] of [['Vhalam', 'vhalam'], ['Buddhaji', 'buddhaji']] as const) {
    const project = await prisma.project.upsert({ where: { organizationId_slug: { organizationId: organization.id, slug } }, create: { organizationId: organization.id, name, slug }, update: { name } })
    await prisma.projectMember.upsert({ where: { projectId_organizationMemberId: { projectId: project.id, organizationMemberId: member.id } }, create: { projectId: project.id, organizationMemberId: member.id, organizationId: organization.id, role: 'OWNER' }, update: { role: 'OWNER' } })
  }
}
main().finally(() => prisma.$disconnect())
