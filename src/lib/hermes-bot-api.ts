import { NextResponse } from 'next/server'
import { HermesBotError } from '@/lib/hermes-bots'

export function botErrorResponse(error: unknown) {
  if (!(error instanceof HermesBotError)) throw error
  const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'RUNTIME_ASSIGNMENT_NOT_FOUND' ? 404 : error.code === 'RUNTIME_SUSPENDED' ? 409 : 400
  return NextResponse.json({ error: error.code }, { status })
}
