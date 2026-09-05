import { NextResponse } from 'next/server'

import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'
import { getWorkforceScorecard, parseScorecardRange, WorkforceScorecardError } from '@/lib/workforce-scorecard'

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const url = new URL(request.url)
    const range = parseScorecardRange({ start: url.searchParams.get('start'), end: url.searchParams.get('end') })
    return NextResponse.json(await getWorkforceScorecard(context, range))
  } catch (error) {
    if (error instanceof WorkforceScorecardError) {
      const messages = {
        FORBIDDEN: 'Forbidden',
        NOT_FOUND: 'Not found',
        INVALID_RANGE: 'The scorecard date range must be between 1 and 90 days and use UTC timestamps.',
        RANGE_TOO_DENSE: 'The selected range contains too much evidence to summarize safely.',
      } as const
      return NextResponse.json({ error: messages[error.code] }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400 })
    }
    return projectScopeErrorResponse(error)
  }
}
