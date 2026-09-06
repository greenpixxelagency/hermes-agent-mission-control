import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireProjectContextForRequest } from '@/lib/project-scope'

const base = () => (process.env.HERMES_PUBLIC_URL || 'https://hermes-agent-nqqk.srv1899670.hstgr.cloud').replace(/\/$/, '')
const b64 = (value: Buffer) => value.toString('base64url')

export async function GET(request: Request) {
  const context = await requireProjectContextForRequest(request)
  const state = b64(randomBytes(32)); const verifier = b64(randomBytes(48)); const challenge = b64(createHash('sha256').update(verifier).digest())
  const callback = new URL('/api/hermes/callback', request.url).toString()
  const target = new URL(`${base()}/auth/native/authorize`)
  target.searchParams.set('redirect_uri', callback); target.searchParams.set('state', state); target.searchParams.set('code_challenge', challenge); target.searchParams.set('code_challenge_method', 'S256')
  const response = NextResponse.redirect(target)
  response.cookies.set('rogeros_hermes_oauth', JSON.stringify({ state, verifier, projectId: context.project.id, callback }), { httpOnly: true, sameSite: 'lax', secure: new URL(request.url).protocol === 'https:', maxAge: 600, path: '/' })
  return response
}
