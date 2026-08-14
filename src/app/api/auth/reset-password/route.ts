import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, hashResetToken, passwordError } from '@/lib/native-auth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null
  const token = typeof body?.token === 'string' ? body.token : ''; const password = typeof body?.password === 'string' ? body.password : ''
  if (!token || passwordError(password)) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })
  const reset = await prisma.passwordResetToken.findFirst({ where: { tokenHash: hashResetToken(token), usedAt: null, expiresAt: { gt: new Date() } } })
  if (!reset) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })
  const passwordHash = await hashPassword(password)
  await prisma.$transaction([prisma.userCredential.upsert({ where: { userId: reset.userId }, create: { userId: reset.userId, passwordHash }, update: { passwordHash, passwordUpdatedAt: new Date() } }), prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } })])
  return NextResponse.json({ ok: true })
}
