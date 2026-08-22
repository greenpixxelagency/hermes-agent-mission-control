import { NextResponse } from 'next/server'

import { canManageRuntimeAssignments, HermesRuntimeError } from '@/lib/hermes-runtime'
import { runtimeErrorResponse } from '@/lib/hermes-runtime-api'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'
import { botProfileId } from '@/lib/hermes-bots'

const supportedRuntimeKey = 'rogeros-hermes-staging'

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const assignments = await prisma.hermesRuntimeAssignment.findMany({
      where: { projectId: context.project.id },
      include: { runtime: true, employeeAssignment: { include: { employee: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json({ assignments })
  } catch (error) {
    return projectScopeErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const context = await requireProjectContextForBody(body)
    if (!canManageRuntimeAssignments(context.project.role)) throw new HermesRuntimeError('FORBIDDEN')
    const runtimeId = typeof body.runtimeId === 'string' ? body.runtimeId : ''
    const employeeProjectAssignmentId = typeof body.employeeProjectAssignmentId === 'string' ? body.employeeProjectAssignmentId : ''
    if (!runtimeId || !employeeProjectAssignmentId) throw new HermesRuntimeError('RUNTIME_ASSIGNMENT_NOT_FOUND')
    const [runtime, employeeAssignment] = await Promise.all([
      prisma.hermesRuntime.findFirst({ where: { id: runtimeId, key: supportedRuntimeKey, status: 'ACTIVE' } }),
      prisma.employeeProjectAssignment.findFirst({ where: { id: employeeProjectAssignmentId, projectId: context.project.id, status: 'ACTIVE' } }),
    ])
    if (!runtime || !employeeAssignment) throw new HermesRuntimeError('RUNTIME_ASSIGNMENT_NOT_FOUND')
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: employeeAssignment.employeeId }, select: { name: true, systemKey: true } })
    const profileKey = botProfileId(context.project.slug, employee.systemKey || employee.name)
    const assignment = await prisma.hermesRuntimeAssignment.upsert({
      where: { projectId_employeeProjectAssignmentId: { projectId: context.project.id, employeeProjectAssignmentId: employeeAssignment.id } },
      create: { projectId: context.project.id, runtimeId: runtime.id, employeeProjectAssignmentId: employeeAssignment.id, profileKey, active: true },
      update: { runtimeId: runtime.id, active: true },
      include: { runtime: true, employeeAssignment: { include: { employee: true } } },
    })
    return NextResponse.json({ assignment }, { status: 201 })
  } catch (error) {
    try { return projectScopeErrorResponse(error) } catch (scopeError) { return runtimeErrorResponse(scopeError) }
  }
}
