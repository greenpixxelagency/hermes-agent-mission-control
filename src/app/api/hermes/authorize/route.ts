import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireProjectContextForRequest } from '@/lib/project-scope'
import { encryptHermesCredential } from '@/lib/hermes-connection'

const base = () => (process.env.HERMES_PUBLIC_URL || 'https://hermes-agent-nqqk.srv1899670.hstgr.cloud').replace(/\/$/, '')
const b64 = (value: Buffer) => value.toString('base64url')

export async function GET(request: Request) {
  const context = await requireProjectContextForRequest(request)
  if (!['OWNER', 'ADMIN'].includes(context.project.role)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const verifier = b64(randomBytes(48)); const challenge = b64(createHash('sha256').update(verifier).digest())
  const origin = new URL(process.env.NEXTAUTH_URL || request.url).origin
  const callbackUrl = new URL('/api/hermes/callback', origin)
  if (!['localhost', '127.0.0.1'].includes(callbackUrl.hostname)) return NextResponse.json({ error: 'Native Hermes sign-in requires a local RogerOS callback.' }, { status: 400 })
  callbackUrl.hostname = callbackUrl.hostname === 'localhost' ? '[::1]' : '127.0.0.1'
  const callback = callbackUrl.toString()
  const binding = b64(randomBytes(32))
  const state = encryptHermesCredential({ verifier, projectId: context.project.id, userId: context.user.id, binding, issuedAt: Date.now() })
  const target = new URL(`${base()}/auth/native/authorize`)
  target.searchParams.set('provider', 'nous')
  target.searchParams.set('redirect_uri', callback); target.searchParams.set('state', state); target.searchParams.set('code_challenge', challenge); target.searchParams.set('code_challenge_method', 'S256')
  const response = NextResponse.json({ authorizationUrl: target.toString() }, { headers: { 'Cache-Control': 'no-store' } })
  response.cookies.set('hermes-oauth-binding', binding, { httpOnly: true, sameSite: 'lax', secure: origin.startsWith('https:'), path: '/api/hermes', maxAge: 600 })
  return response
}
