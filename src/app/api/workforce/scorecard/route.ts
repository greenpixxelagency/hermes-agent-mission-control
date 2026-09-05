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
    if (error instanceof WorkforceScorecardError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Forbidden' : 'The scorecard date range must be between 1 and 90 days.' }, { status: error.code === 'FORBIDDEN' ? 403 : 400 })
    return projectScopeErrorResponse(error)
  }
}
