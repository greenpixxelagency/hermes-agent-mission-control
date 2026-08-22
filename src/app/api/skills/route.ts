import { NextResponse } from 'next/server'

import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'
import { assignSkill, listAvailableSkills, listEmployeeSkills, removeSkill, SkillLibraryError } from '@/lib/skills'

function errorResponse(error: unknown) {
  try { return projectScopeErrorResponse(error) } catch (scopeError) {
    if (!(scopeError instanceof SkillLibraryError)) throw scopeError
    const status = scopeError.code === 'FORBIDDEN' ? 403 : scopeError.code.endsWith('NOT_FOUND') || scopeError.code === 'SKILL_NOT_AVAILABLE' ? 404 : 400
    return NextResponse.json({ error: scopeError.code }, { status })
  }
}

function publicAssignment(assignment: { id:string; state:string; reconciliationStatus:string; skill:{id:string;slug:string;name:string;description:string;category:string;version:string} }) {
  return { id:assignment.id, state:assignment.state, reconciliationStatus:assignment.reconciliationStatus, skill:assignment.skill }
}

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const employeeProjectAssignmentId = new URL(request.url).searchParams.get('employeeProjectAssignmentId')
    return NextResponse.json({
      skills: await listAvailableSkills(context),
      assignments: employeeProjectAssignmentId ? await listEmployeeSkills(context, employeeProjectAssignmentId) : [],
    })
  } catch (error) { return errorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    const employeeProjectAssignmentId = typeof body.employeeProjectAssignmentId === 'string' ? body.employeeProjectAssignmentId : ''
    const skillId = typeof body.skillId === 'string' ? body.skillId : ''
    if (!employeeProjectAssignmentId || !skillId) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 })
    return NextResponse.json({ assignment: publicAssignment(await assignSkill(context, employeeProjectAssignmentId, skillId)) }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    const employeeProjectAssignmentId = typeof body.employeeProjectAssignmentId === 'string' ? body.employeeProjectAssignmentId : ''
    const skillId = typeof body.skillId === 'string' ? body.skillId : ''
    if (!employeeProjectAssignmentId || !skillId) return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 })
    return NextResponse.json({ assignment: publicAssignment(await removeSkill(context, employeeProjectAssignmentId, skillId)) })
  } catch (error) { return errorResponse(error) }
}
