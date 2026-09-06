import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { NextResponse } from 'next/server'

const localOnly = (request: Request) => process.env.NODE_ENV === 'development' && new URL(request.url).hostname === 'localhost'

export async function POST(request: Request) {
  if (!localOnly(request)) return NextResponse.json({ error: 'NOT_AVAILABLE' }, { status: 404 })
  const body = await request.json().catch(() => null) as { clientSecret?: unknown } | null
  const clientSecret = typeof body?.clientSecret === 'string' ? body.clientSecret.trim() : ''
  if (!/^GOCSPX-[A-Za-z0-9_-]{20,}$/.test(clientSecret)) return NextResponse.json({ error: 'INVALID_SECRET' }, { status: 400 })
  await writeFile(join(process.cwd(), '.rogeros-local-oauth.json'), JSON.stringify({ clientId: '407086383696-b4gan2ut655siop2bf1s5ldm412nne74.apps.googleusercontent.com', clientSecret }), { encoding: 'utf8', mode: 0o600 })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
