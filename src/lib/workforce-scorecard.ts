import { Prisma } from '@prisma/client'

import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

const DAY_MS = 86_400_000
export const DEFAULT_SCORECARD_DAYS = 30
export const MAX_SCORECARD_DAYS = 90
export const MAX_EVIDENCE_ROWS = 1000
const readerRoles = new Set(['OWNER', 'ADMIN', 'OPERATOR', 'APPROVER'])
const auditTypes = [
  'runtime.execution.succeeded', 'runtime.execution.failed',
  'runtime.execution.review_accepted', 'runtime.execution.revision_requested',
  'tool.execution.succeeded', 'tool.execution.failed',
]

export class WorkforceScorecardError extends Error {
  constructor(public readonly code: 'INVALID_RANGE' | 'FORBIDDEN' | 'NOT_FOUND' | 'RANGE_TOO_DENSE') {
    super(code); this.name = 'WorkforceScorecardError'
  }
}

export type ScorecardRange = { start: Date; end: Date; days: number }
export function canReadWorkforceScorecard(role: string) { return readerRoles.has(role) }

// Require explicit UTC timestamps. Reject JS's permissive dates and rollover dates.
function parseTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new WorkforceScorecardError('INVALID_RANGE')
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new WorkforceScorecardError('INVALID_RANGE')
  return parsed
}

export function parseScorecardRange(input: { start?: string | null; end?: string | null }, now = new Date()): ScorecardRange {
  const end = input.end == null ? now : parseTimestamp(input.end)
  const start = input.start == null ? new Date(end.getTime() - DEFAULT_SCORECARD_DAYS * DAY_MS) : parseTimestamp(input.start)
  const span = end.getTime() - start.getTime()
  if (!Number.isFinite(span) || span <= 0 || span > MAX_SCORECARD_DAYS * DAY_MS || end > now) throw new WorkforceScorecardError('INVALID_RANGE')
  return { start, end, days: span / DAY_MS }
}

const inRange = (value: Date | null, range: ScorecardRange) => Boolean(value && value >= range.start && value < range.end)

export async function getWorkforceScorecard(context: ProjectContext, requested: ScorecardRange) {
  if (!canReadWorkforceScorecard(context.project.role)) throw new WorkforceScorecardError('FORBIDDEN')
  const range = parseScorecardRange({ start: requested.start.toISOString(), end: requested.end.toISOString() })
  const projectId = context.project.id
  const window = { gte: range.start, lt: range.end }

  return prisma.$transaction(async db => {
    // Check persisted authority again: stale or caller-constructed context cannot grant access.
    const member = await db.projectMember.findFirst({ where: { projectId, organizationMember: { userId: context.user.id } }, select: { role: true } })
    if (!member) throw new WorkforceScorecardError('NOT_FOUND')
    if (!canReadWorkforceScorecard(member.role)) throw new WorkforceScorecardError('FORBIDDEN')

    const [employees, tasks, executions, tools] = await Promise.all([
      db.employeeProjectAssignment.findMany({ where: { projectId }, take: 201, orderBy: { id: 'asc' }, select: { id: true, status: true, employee: { select: { name: true, role: true } } } }),
      db.taskAssignment.findMany({
        where: { projectId, employeeProjectAssignmentId: { not: null }, OR: [{ createdAt: window }, { task: { completedAt: window } }] },
        take: MAX_EVIDENCE_ROWS + 1, orderBy: { id: 'asc' },
        select: { id: true, employeeProjectAssignmentId: true, createdAt: true, task: { select: { id: true, status: true, completedAt: true } } },
      }),
      db.hermesExecution.findMany({
        where: { projectId, OR: [{ createdAt: window }, { completedAt: window }, { reviewedAt: window }] },
        take: MAX_EVIDENCE_ROWS + 1, orderBy: { id: 'asc' },
        select: { id: true, taskId: true, createdAt: true, completedAt: true, reviewedAt: true, status: true, reviewStatus: true, runtimeAssignment: { select: { employeeProjectAssignmentId: true } } },
      }),
      db.toolExecution.findMany({
        where: { projectId, OR: [{ createdAt: window }, { completedAt: window }] },
        take: MAX_EVIDENCE_ROWS + 1, orderBy: { id: 'asc' },
        select: { id: true, employeeProjectAssignmentId: true, projectToolId: true, projectConnectionId: true, createdAt: true, completedAt: true, status: true },
      }),
    ])
    if (employees.length > 200 || [tasks, executions, tools].some(rows => rows.length > MAX_EVIDENCE_ROWS)) throw new WorkforceScorecardError('RANGE_TOO_DENSE')
    const audits = await db.auditEvent.findMany({
      where: { projectId, eventType: { in: auditTypes }, OR: [
        { targetType: 'HermesExecution', targetId: { in: executions.map(row => row.id) } },
        { targetType: 'ToolExecution', targetId: { in: tools.map(row => row.id) } },
      ] },
      take: MAX_EVIDENCE_ROWS + 1, orderBy: { id: 'asc' },
      select: { id: true, eventType: true, targetType: true, targetId: true, createdAt: true },
    })
    if (audits.length > MAX_EVIDENCE_ROWS) throw new WorkforceScorecardError('RANGE_TOO_DENSE')

    return {
      projectId,
      generatedAt: new Date().toISOString(),
      range: { start: range.start.toISOString(), end: range.end.toISOString(), days: range.days, inclusion: '[start, end) UTC' },
      access: { mode: 'READ_ONLY', allowedRoles: [...readerRoles] },
      provenance: {
        assignedWork: 'Current TaskAssignment links: assignments by createdAt, currently DONE tasks by completedAt. Shared tasks count for each current assignee; this is association, not individual credit or an immutable assignment history.',
        runtimeAttempts: 'HermesExecution: created by createdAt, succeeded by completedAt, accepted by reviewedAt. Accepted requires SUCCEEDED and ACCEPTED. Attribution uses the current project runtime assignment; missing attribution is reported separately.',
        governedToolExecutions: 'ToolExecution: created by createdAt, succeeded/failed by completedAt; projectToolId and projectConnectionId identify the governed records without fetching credentials or calling a provider.',
        audit: 'Existing allowlisted lifecycle AuditEvent IDs are supporting references, including events outside the range for selected executions. Missing audit evidence is not synthesized. Status fields are current observed state, not an as-of historical snapshot.',
        cost: 'No authoritative provider usage/cost fields exist on these execution records. Amount and currency are unknown; JSON metadata, configured model prices, and legacy Hermy HQ costs are not cost evidence. No estimate is calculated.',
      },
      unattributedRuntimeRecords: executions.filter(row => !row.runtimeAssignment.employeeProjectAssignmentId).length,
      workers: employees.map(employee => {
        const assigned = tasks.filter(row => row.employeeProjectAssignmentId === employee.id)
        const attempts = executions.filter(row => row.runtimeAssignment.employeeProjectAssignmentId === employee.id)
        const actions = tools.filter(row => row.employeeProjectAssignmentId === employee.id)
        const ids = new Set([...attempts, ...actions].map(row => row.id))
        return {
          employee: { assignmentId: employee.id, name: employee.employee.name, role: employee.employee.role, employmentStatus: employee.status },
          assignedWork: {
            assignedInRange: assigned.filter(row => inRange(row.createdAt, range)).length,
            completedInRange: assigned.filter(row => row.task.status === 'DONE' && inRange(row.task.completedAt, range)).length,
          },
          runtimeAttempts: {
            createdInRange: attempts.filter(row => inRange(row.createdAt, range)).length,
            succeededInRange: attempts.filter(row => row.status === 'SUCCEEDED' && inRange(row.completedAt, range)).length,
            acceptedInRange: attempts.filter(row => row.status === 'SUCCEEDED' && row.reviewStatus === 'ACCEPTED' && inRange(row.reviewedAt, range)).length,
          },
          governedToolExecutions: {
            createdInRange: actions.filter(row => inRange(row.createdAt, range)).length,
            succeededInRange: actions.filter(row => row.status === 'SUCCEEDED' && inRange(row.completedAt, range)).length,
            failedInRange: actions.filter(row => row.status === 'FAILED' && inRange(row.completedAt, range)).length,
          },
          cost: { actualAmount: null, currency: null, availability: 'UNKNOWN' as const, reason: 'NO_PROVIDER_USAGE_RECORD' as const },
          evidence: {
            taskAssignments: assigned,
            runtimeExecutions: attempts,
            toolExecutions: actions,
            auditEvents: audits.filter(row => row.targetId && ids.has(row.targetId)),
          },
        }
      }),
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000 })
}
