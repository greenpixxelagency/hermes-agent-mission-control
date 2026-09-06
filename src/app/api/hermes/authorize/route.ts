import { createHash, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireProjectContextForRequest } from '@/lib/project-scope'
import { encryptHermesCredential } from '@/lib/hermes-connection'

const base = () => (process.env.HERMES_PUBLIC_URL || 'https://hermes-agent-nqqk.srv1899670.hstgr.cloud').replace(/\/$/, '')
const b64 = (value: Buffer) => value.toString('base64url')

export async function GET(request: Request) {
  const context = await requireProjectContextForRequest(request)
  const verifier = b64(randomBytes(48)); const challenge = b64(createHash('sha256').update(verifier).digest())
  const callback = 'http://127.0.0.1:3001/api/hermes/callback'
  const state = encryptHermesCredential({ verifier, projectId: context.project.id, issuedAt: Date.now() })
  const target = new URL(`${base()}/auth/native/authorize`)
  target.searchParams.set('redirect_uri', callback); target.searchParams.set('state', state); target.searchParams.set('code_challenge', challenge); target.searchParams.set('code_challenge_method', 'S256')
  return NextResponse.json({ authorizationUrl: target.toString() })
}
