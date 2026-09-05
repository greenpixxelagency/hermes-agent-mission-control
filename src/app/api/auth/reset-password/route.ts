import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword, hashResetToken, passwordError } from '@/lib/native-auth'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { token?: unknown; password?: unknown } | null
  const token = typeof body?.token === 'string' ? body.token : ''; const password = typeof body?.password === 'string' ? body.password : ''
  if (!token || passwordError(password)) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })
  const passwordHash = await hashPassword(password)
  const now = new Date()
  const consumed = await prisma.$transaction(async db => {
    const reset = await db.passwordResetToken.findFirst({ where: { tokenHash: hashResetToken(token), usedAt: null, expiresAt: { gt: now } }, select: { id: true, userId: true } })
    if (!reset) return false
    const claim = await db.passwordResetToken.updateMany({ where: { id: reset.id, tokenHash: hashResetToken(token), usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })
    if (claim.count !== 1) return false
    await db.userCredential.upsert({ where: { userId: reset.userId }, create: { userId: reset.userId, passwordHash }, update: { passwordHash, passwordUpdatedAt: now } })
    return true
  })
  if (!consumed) return NextResponse.json({ error: 'Invalid or expired reset request.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
