import { NextResponse } from 'next/server'
import { finishDriveOAuth } from '@/lib/drive-oauth'
import { requirePersistentUser } from '@/lib/project-context'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code') ?? ''
  if (!state || !code) return NextResponse.json({ error: 'DRIVE_OAUTH_CALLBACK_INVALID' }, { status: 400 })
  try {
    const user = await requirePersistentUser()
    const result = await finishDriveOAuth({ userId: user.id, state, code, origin: url.origin })
    return NextResponse.redirect(new URL(`/p/${result.projectSlug}/tools?drive=connected&connection=${result.connection.id}`, url.origin))
  } catch { return NextResponse.json({ error: 'DRIVE_OAUTH_DENIED_OR_EXPIRED' }, { status: 400 }) }
}
