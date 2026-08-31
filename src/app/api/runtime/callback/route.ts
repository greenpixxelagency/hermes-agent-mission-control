import { NextResponse } from 'next/server'

import { MAX_CALLBACK_BODY_BYTES, parseHermesCompletion, verifyHermesCallback } from '@/lib/hermes-callback'
import { applyHermesCompletionCallback, HermesRuntimeError } from '@/lib/hermes-runtime'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.text()
    if (Buffer.byteLength(body, 'utf8') > MAX_CALLBACK_BODY_BYTES) throw new HermesRuntimeError('CALLBACK_TOO_LARGE')
    const evidence = verifyHermesCallback({ secret: process.env.ROGEROS_HERMES_CALLBACK_SECRET, timestamp: request.headers.get('x-rogeros-timestamp'), signature: request.headers.get('x-rogeros-signature'), body })
    const execution = await applyHermesCompletionCallback(parseHermesCompletion(body), evidence)
    return NextResponse.json({ accepted: true, executionId: execution.id, status: execution.status })
  } catch (error) {
    if (!(error instanceof HermesRuntimeError)) throw error
    const status = error.code === 'CALLBACK_UNAUTHORIZED' || error.code === 'CALLBACK_EXPIRED' ? 401 : error.code === 'EXECUTION_NOT_FOUND' ? 404 : error.code === 'CALLBACK_CONFLICT' ? 409 : error.code === 'CALLBACK_TOO_LARGE' ? 413 : 400
    return NextResponse.json({ error: error.code }, { status })
  }
}
