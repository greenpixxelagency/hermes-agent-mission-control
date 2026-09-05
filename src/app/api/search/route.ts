import { NextResponse } from 'next/server'

import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'
import { ProjectSearchError, parseProjectSearchQuery, searchProjectRecords } from '@/lib/project-search'

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const query = parseProjectSearchQuery(new URL(request.url).searchParams.get('q'))
    return NextResponse.json(await searchProjectRecords(context, query))
  } catch (error) {
    if (error instanceof ProjectSearchError) {
      return NextResponse.json({ error: error.code === 'INVALID_QUERY' ? 'Search queries must be at most 100 characters.' : 'Not found' }, { status: error.code === 'INVALID_QUERY' ? 400 : 404 })
    }
    return projectScopeErrorResponse(error)
  }
}
