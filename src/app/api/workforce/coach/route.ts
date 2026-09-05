import { NextResponse } from 'next/server'

import { getAgentCoachRecommendations } from '@/lib/agent-coach'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'
import { parseScorecardRange, WorkforceScorecardError } from '@/lib/workforce-scorecard'

// Coach is intentionally GET-only. It has no apply, approval, or runtime path.
export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const url = new URL(request.url)
    const range = parseScorecardRange({ start: url.searchParams.get('start'), end: url.searchParams.get('end') })
    return NextResponse.json(await getAgentCoachRecommendations(context, range), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof WorkforceScorecardError) {
      const messages = {
        FORBIDDEN: 'Forbidden', NOT_FOUND: 'Not found',
        INVALID_RANGE: 'The Coach date range must be between 1 and 90 days and use UTC timestamps.',
        RANGE_TOO_DENSE: 'The selected range contains too much evidence to summarize safely.',
      } as const
      return NextResponse.json({ error: messages[error.code] }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400 })
    }
    return projectScopeErrorResponse(error)
  }
}
