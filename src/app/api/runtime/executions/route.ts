import { NextResponse } from 'next/server'

import { safeExecution } from '@/lib/hermes-runtime-api'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request: Request) {
  try {
    const context = await requireProjectContextForRequest(request)
    const taskId = new URL(request.url).searchParams.get('taskId')
    const executions = await prisma.hermesExecution.findMany({
      where: { projectId: context.project.id, ...(taskId ? { taskId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return NextResponse.json({ executions: executions.map(safeExecution) })
  } catch (error) {
    return projectScopeErrorResponse(error)
  }
}
