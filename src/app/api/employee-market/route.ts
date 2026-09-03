import { NextResponse } from 'next/server'

import { EmployeeMarketError, hireEmployeeFromMarket, listEmployeeMarketTemplates } from '@/lib/employee-market'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

function marketErrorResponse(error: unknown) {
  if (error instanceof EmployeeMarketError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Forbidden' : error.code === 'TEMPLATE_NOT_FOUND' ? 'Not found' : 'Invalid employee market request' }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'TEMPLATE_NOT_FOUND' ? 404 : 400 })
  return projectScopeErrorResponse(error)
}

export async function GET(request: Request) {
  try { return NextResponse.json({ templates: await listEmployeeMarketTemplates(await requireProjectContextForRequest(request)) }) }
  catch (error) { return marketErrorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const result = await hireEmployeeFromMarket(await requireProjectContextForBody(body), body)
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error) { return marketErrorResponse(error) }
}
