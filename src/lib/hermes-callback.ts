import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import type { HermesAdapterExecution } from '@/lib/hermes-runtime-adapter'
import { HermesRuntimeError } from '@/lib/hermes-runtime'

const MAX_CALLBACK_AGE_SECONDS = 300
export const MAX_CALLBACK_BODY_BYTES = 32_768

export async function readBoundedCallbackBody(request: Request) {
  const contentLength = request.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_CALLBACK_BODY_BYTES) throw new HermesRuntimeError('CALLBACK_TOO_LARGE')
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > MAX_CALLBACK_BODY_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new HermesRuntimeError('CALLBACK_TOO_LARGE')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)), totalBytes).toString('utf8')
}

export function callbackSignature(secret: string, timestamp: string, body: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export function verifyHermesCallback(input: { secret: string | undefined; timestamp: string | null; signature: string | null; body: string; now?: number }) {
  if (!input.secret || input.secret.length < 48 || !input.timestamp || !input.signature) throw new HermesRuntimeError('CALLBACK_UNAUTHORIZED')
  if (!/^\d{10}$/.test(input.timestamp) || !/^[0-9a-f]{64}$/i.test(input.signature)) throw new HermesRuntimeError('CALLBACK_UNAUTHORIZED')
  const timestamp = Number(input.timestamp)
  const now = Math.floor((input.now ?? Date.now()) / 1000)
  if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > MAX_CALLBACK_AGE_SECONDS) throw new HermesRuntimeError('CALLBACK_EXPIRED')
  const expected = Buffer.from(callbackSignature(input.secret, input.timestamp, input.body), 'hex')
  const received = Buffer.from(input.signature, 'hex')
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new HermesRuntimeError('CALLBACK_UNAUTHORIZED')
  return { fingerprint: createHash('sha256').update(input.body).digest('hex'), receivedAt: new Date(input.now ?? Date.now()) }
}

export function parseHermesCompletion(body: string): HermesAdapterExecution {
  let value: unknown
  try { value = JSON.parse(body) } catch { throw new HermesRuntimeError('CALLBACK_MALFORMED') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HermesRuntimeError('CALLBACK_MALFORMED')
  const record = value as Record<string, unknown>
  const allowed = new Set(['externalExecutionId', 'status', 'startedAt', 'completedAt', 'result', 'error'])
  if (Object.keys(record).some(key => !allowed.has(key))) throw new HermesRuntimeError('CALLBACK_MALFORMED')
  if (typeof record.externalExecutionId !== 'string' || (record.status !== 'SUCCEEDED' && record.status !== 'FAILED')) throw new HermesRuntimeError('CALLBACK_MALFORMED')
  if (record.startedAt !== null && typeof record.startedAt !== 'string') throw new HermesRuntimeError('CALLBACK_MALFORMED')
  if (record.completedAt !== null && typeof record.completedAt !== 'string') throw new HermesRuntimeError('CALLBACK_MALFORMED')
  if (record.result !== undefined && typeof record.result !== 'string') throw new HermesRuntimeError('CALLBACK_MALFORMED')
  if (record.error !== undefined && typeof record.error !== 'string') throw new HermesRuntimeError('CALLBACK_MALFORMED')
  return record as HermesAdapterExecution
}
