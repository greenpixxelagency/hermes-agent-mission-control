import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, isAllowedEmail, isLocalDevelopment, normalizeEmail, passwordError } from '@/lib/native-auth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^\S+@\S+\.\S+$/.test(email) || passwordError(password)) return NextResponse.json({ error: 'Enter a valid email and a password of at least 12 characters.' }, { status: 400 })
  if (!isAllowedEmail(email)) return NextResponse.json({ error: 'Unable to create account with these details.' }, { status: 403 })
  const existing = await prisma.user.findUnique({ where: { email }, include: { credential: true } })
  // Never attach credentials to an existing federated account: doing so would
  // let an unauthenticated caller take over that account by knowing its email.
  if (existing) return NextResponse.json({ error: 'Unable to create account with these details.' }, { status: 409 })
  const passwordHash = await hashPassword(password)
  const user = await prisma.user.create({ data: { email, credential: { create: { passwordHash } } } })
  // A local account is deliberately isolated: it receives a new organization
  // and workspace, never access to an existing staging or production project.
  if (isLocalDevelopment()) {
    const suffix = user.id.slice(-8).toLowerCase()
    await prisma.$transaction(async tx => {
      const organization = await tx.organization.create({ data: { name: 'My local workspace', slug: `local-${suffix}` } })
      const member = await tx.organizationMember.create({ data: { userId: user.id, organizationId: organization.id, role: 'OWNER' } })
      const project = await tx.project.create({ data: { organizationId: organization.id, name: 'My project', slug: 'local' } })
      await tx.projectMember.create({ data: { projectId: project.id, organizationId: organization.id, organizationMemberId: member.id, role: 'OWNER' } })
    })
  }
  return NextResponse.json({ ok: true }, { status: 201 })
}
