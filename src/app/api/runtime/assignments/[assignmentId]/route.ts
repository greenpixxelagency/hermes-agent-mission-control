import { NextResponse } from 'next/server'

import { canManageRuntimeAssignments, HermesRuntimeError } from '@/lib/hermes-runtime'
import { runtimeErrorResponse } from '@/lib/hermes-runtime-api'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function PATCH(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    if (!canManageRuntimeAssignments(context.project.role)) throw new HermesRuntimeError('FORBIDDEN')
    const { assignmentId } = await params
    const assignment = await prisma.hermesRuntimeAssignment.findFirst({ where: { id: assignmentId, projectId: context.project.id } })
    if (!assignment) throw new HermesRuntimeError('RUNTIME_ASSIGNMENT_NOT_FOUND')
    if (typeof body.active !== 'boolean') return NextResponse.json({ error: 'INVALID_RUNTIME_ASSIGNMENT_UPDATE' }, { status: 400 })
    const updated = await prisma.hermesRuntimeAssignment.update({ where: { id: assignment.id }, data: { active: body.active }, include: { runtime: true, employeeAssignment: { include: { employee: true } } } })
    return NextResponse.json({ assignment: updated })
  } catch (error) {
    try { return projectScopeErrorResponse(error) } catch (scopeError) { return runtimeErrorResponse(scopeError) }
  }
}
