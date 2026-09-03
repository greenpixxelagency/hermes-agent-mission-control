import { NextResponse } from 'next/server'

import { EmployeeMarketError, changeEmployeeEmployment } from '@/lib/employee-market'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>
    const action = body.action
    if (action !== 'pause' && action !== 'resume' && action !== 'retire') return NextResponse.json({ error: 'Invalid employment action' }, { status: 400 })
    const assignmentId = (await params).assignmentId
    const assignment = await changeEmployeeEmployment(await requireProjectContextForBody(body), assignmentId, action)
    return NextResponse.json({ assignment })
  } catch (error) {
    if (error instanceof EmployeeMarketError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Forbidden' : error.code === 'EMPLOYEE_ASSIGNMENT_NOT_FOUND' ? 'Not found' : 'Employment action not allowed' }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'EMPLOYEE_ASSIGNMENT_NOT_FOUND' ? 404 : 409 })
    return projectScopeErrorResponse(error)
  }
}
