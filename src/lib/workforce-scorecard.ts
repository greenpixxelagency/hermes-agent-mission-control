import { HermesExecutionReviewStatus, HermesExecutionStatus, TaskStatus, ToolExecutionStatus } from '@prisma/client'

import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

const DAY_MS = 24 * 60 * 60 * 1000
export const DEFAULT_SCORECARD_DAYS = 30
export const MAX_SCORECARD_DAYS = 90

export class WorkforceScorecardError extends Error {
  constructor(public readonly code: 'INVALID_RANGE' | 'FORBIDDEN') { super(code); this.name = 'WorkforceScorecardError' }
}

export type ScorecardRange = { start: Date; end: Date; days: number }

/**
 * Scorecards deliberately expose only read-only, project-scoped evidence.
 * Approved project roles can inspect these safe aggregate facts; management
 * and employment changes retain their existing stronger role requirements.
 */
const scorecardReaderRoles = new Set(['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER'])
export function canReadWorkforceScorecard(role: string) { return scorecardReaderRoles.has(role) }

export function parseScorecardRange(input: { start?: string | null; end?: string | null }, now = new Date()): ScorecardRange {
  const end = input.end ? new Date(input.end) : now
  const start = input.start ? new Date(input.start) : new Date(end.getTime() - (DEFAULT_SCORECARD_DAYS * DAY_MS))
  const days = Math.ceil((end.getTime() - start.getTime()) / DAY_MS)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end || days < 1 || days > MAX_SCORECARD_DAYS) {
    throw new WorkforceScorecardError('INVALID_RANGE')
  }
  return { start, end, days }
}

const inRange = (value: Date | null, range: ScorecardRange) => Boolean(value && value >= range.start && value <= range.end)

export async function getWorkforceScorecard(context: ProjectContext, range: ScorecardRange) {
  if (!canReadWorkforceScorecard(context.project.role)) throw new WorkforceScorecardError('FORBIDDEN')

  const [employees, runtimeExecutions, toolExecutions] = await Promise.all([
    prisma.employeeProjectAssignment.findMany({
      where: { projectId: context.project.id },
      select: {
        id: true,
        status: true,
        employee: { select: { name: true, role: true } },
        taskAssignments: {
          where: { OR: [{ createdAt: { gte: range.start, lte: range.end } }, { task: { completedAt: { gte: range.start, lte: range.end } } }] },
          select: { createdAt: true, task: { select: { status: true, completedAt: true } } },
        },
      },
      orderBy: { employee: { name: 'asc' } },
    }),
    prisma.hermesExecution.findMany({
      where: { projectId: context.project.id, createdAt: { gte: range.start, lte: range.end } },
      select: { status: true, reviewStatus: true, runtimeAssignment: { select: { employeeProjectAssignmentId: true } } },
    }),
    prisma.toolExecution.findMany({
      where: { projectId: context.project.id, createdAt: { gte: range.start, lte: range.end } },
      select: { status: true, employeeProjectAssignmentId: true },
    }),
  ])

  const workers = employees.map(employee => {
    const executions = runtimeExecutions.filter(execution => execution.runtimeAssignment.employeeProjectAssignmentId === employee.id)
    const tools = toolExecutions.filter(execution => execution.employeeProjectAssignmentId === employee.id)
    return {
      employee: { name: employee.employee.name, role: employee.employee.role, employmentStatus: employee.status },
      assignedWork: {
        assignedInRange: employee.taskAssignments.filter(assignment => inRange(assignment.createdAt, range)).length,
        completedInRange: employee.taskAssignments.filter(assignment => assignment.task.status === TaskStatus.DONE && inRange(assignment.task.completedAt, range)).length,
      },
      runtimeAttempts: {
        createdInRange: executions.length,
        succeededInRange: executions.filter(execution => execution.status === HermesExecutionStatus.SUCCEEDED).length,
        acceptedInRange: executions.filter(execution => execution.reviewStatus === HermesExecutionReviewStatus.ACCEPTED).length,
      },
      governedToolExecutions: {
        createdInRange: tools.length,
        succeededInRange: tools.filter(execution => execution.status === ToolExecutionStatus.SUCCEEDED).length,
        failedInRange: tools.filter(execution => execution.status === ToolExecutionStatus.FAILED).length,
      },
      cost: {
        actualAmount: null,
        currency: null,
        availability: 'UNKNOWN' as const,
        reason: 'NO_PROVIDER_USAGE_RECORD' as const,
      },
    }
  })

  return {
    range: { start: range.start.toISOString(), end: range.end.toISOString(), days: range.days, inclusion: 'timestamps are inclusive at both bounds' },
    access: { mode: 'READ_ONLY', allowedRoles: ['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER'] },
    provenance: {
      assignedWork: 'TaskAssignment.createdAt; Task.status and Task.completedAt, all bounded by the requested range',
      runtimeAttempts: 'HermesExecution.createdAt, status, and human reviewStatus',
      governedToolExecutions: 'ToolExecution.createdAt and status',
      cost: 'No provider usage or actual cost field exists in the authoritative records; no estimate is calculated.',
    },
    workers,
  }
}
