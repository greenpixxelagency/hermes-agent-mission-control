import { NextResponse } from 'next/server'

import { AppMarketError, installAppMarketManifest, listAppMarketManifests, listProjectAppInstallations } from '@/lib/app-market'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

function response(error: unknown) {
  if (error instanceof AppMarketError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'MANIFEST_NOT_FOUND' ? 404 : error.code === 'IDEMPOTENCY_KEY_REUSED' || error.code === 'IDEMPOTENCY_IN_PROGRESS' ? 409 : 400
    return NextResponse.json({ error: error.code }, { status })
  }
  return projectScopeErrorResponse(error)
}

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const [manifests, installations] = await Promise.all([listAppMarketManifests(context), listProjectAppInstallations(context)])
    return NextResponse.json({ manifests, installations })
  }
  catch (error) { return response(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const result = await installAppMarketManifest(await requireProjectContextForBody(body), { ...body, idempotencyKey: request.headers.get('idempotency-key') ?? undefined })
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error) { return response(error) }
}
