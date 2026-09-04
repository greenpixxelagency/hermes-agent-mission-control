import { NextResponse } from 'next/server'

import { AppMarketError, installAppMarketManifest, listAppMarketManifests } from '@/lib/app-market'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

function response(error: unknown) {
  if (error instanceof AppMarketError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'MANIFEST_NOT_FOUND' ? 404 : 400
    return NextResponse.json({ error: error.code }, { status })
  }
  return projectScopeErrorResponse(error)
}

export async function GET(request: Request) {
  try { return NextResponse.json({ manifests: await listAppMarketManifests(await requireProjectContextForRequest(request)) }) }
  catch (error) { return response(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const result = await installAppMarketManifest(await requireProjectContextForBody(body), body)
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error) { return response(error) }
}
