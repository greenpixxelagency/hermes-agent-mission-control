import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createResetToken, hashResetToken, normalizeEmail } from '@/lib/native-auth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: unknown } | null
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : ''
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, credential: { select: { id: true } } } }) : null
  if (user?.credential) { const token = createResetToken(); await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } }) }
  return NextResponse.json({ ok: true, message: 'If an account exists, reset instructions will be sent when email delivery is configured.' })
}
