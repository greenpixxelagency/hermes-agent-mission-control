import {
  AuditActorType,
  HermesExecutionStatus,
  Prisma,
  TaskActivityType,
} from '@prisma/client'
import { randomUUID } from 'node:crypto'

import { recordAuditEvent } from '@/lib/audit'
import type { HermesAdapterExecution, HermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import { hermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'
import { canDispatchToHermes, canManageRuntimeAssignments } from '@/lib/hermes-runtime-rules'

const activeStatuses: HermesExecutionStatus[] = [HermesExecutionStatus.QUEUED, HermesExecutionStatus.DISPATCHING, HermesExecutionStatus.RUNNING]
const adapterStatuses = new Set(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'])

export class HermesRuntimeError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'HermesRuntimeError'
  }
}

export { canDispatchToHermes, canManageRuntimeAssignments }

function safeErrorCode(error: unknown) {
  if (error instanceof HermesRuntimeError) return error.code
  return 'ADAPTER_FAILURE'
}

function asDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function validateAdapterExecution(value: HermesAdapterExecution): HermesAdapterExecution {
  if (!value || typeof value !== 'object' || typeof value.externalExecutionId !== 'string' || !value.externalExecutionId.trim() || !adapterStatuses.has(value.status)) {
    throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  }
  if (value.result !== undefined && typeof value.result !== 'string') throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  if (value.error !== undefined && typeof value.error !== 'string') throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  if (value.status === 'SUCCEEDED' && !value.result?.trim()) throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  return value
}

async function actorMember(context: ProjectContext) {
  const member = await prisma.projectMember.findFirst({
    where: { projectId: context.project.id, organizationMember: { userId: context.user.id } },
    select: { id: true },
  })
  if (!member) throw new HermesRuntimeError('FORBIDDEN')
  return member
}

async function recordLifecycle(input: {
  context: ProjectContext
  memberId: string
  executionId: string
  taskId: string
  eventType: string
  activityType: TaskActivityType
  summary: string
}) {
  await prisma.taskActivity.create({
    data: {
      projectId: input.context.project.id,
      taskId: input.taskId,
      actorUserId: input.context.user.id,
      type: input.activityType,
      detail: input.summary,
    },
  })
  await recordAuditEvent({
    projectId: input.context.project.id,
    eventType: input.eventType,
    actor: { type: AuditActorType.HUMAN, projectMemberId: input.memberId },
    targetType: 'HermesExecution',
    targetId: input.executionId,
    taskId: input.taskId,
    summary: input.summary,
    metadata: { executionId: input.executionId },
  })
}

async function markFailed(context: ProjectContext, memberId: string, executionId: string, taskId: string, error: unknown) {
  const execution = await prisma.hermesExecution.update({
    where: { id: executionId },
    data: { status: HermesExecutionStatus.FAILED, completedAt: new Date(), errorMessage: safeErrorCode(error), resultText: null },
  })
  await recordLifecycle({
    context,
    memberId,
    executionId,
    taskId,
    eventType: 'runtime.execution.failed',
    activityType: TaskActivityType.RUNTIME_FAILED,
    summary: 'Hermes execution failed safely',
  })
  return execution
}

async function persistAdapterStatus(context: ProjectContext, memberId: string, executionId: string, taskId: string, response: HermesAdapterExecution) {
  const adapter = validateAdapterExecution(response)
  const current = await prisma.hermesExecution.findFirst({ where: { id: executionId, projectId: context.project.id } })
  if (!current) throw new HermesRuntimeError('EXECUTION_NOT_FOUND')
  if (current.externalExecutionId && current.externalExecutionId !== adapter.externalExecutionId) throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  const common = { externalExecutionId: adapter.externalExecutionId.slice(0, 200), startedAt: asDate(adapter.startedAt) ?? current.startedAt ?? new Date() }

  if (adapter.status === 'SUCCEEDED') {
    const execution = await prisma.hermesExecution.update({
      where: { id: executionId },
      data: { ...common, status: HermesExecutionStatus.SUCCEEDED, resultText: adapter.result!.trim().slice(0, 20000), errorMessage: null, completedAt: asDate(adapter.completedAt) ?? new Date() },
    })
    await recordLifecycle({ context, memberId, executionId, taskId, eventType: 'runtime.execution.succeeded', activityType: TaskActivityType.RUNTIME_SUCCEEDED, summary: 'Hermes execution succeeded' })
    return execution
  }

  if (adapter.status === 'FAILED') {
    const execution = await prisma.hermesExecution.update({
      where: { id: executionId },
      data: { ...common, status: HermesExecutionStatus.FAILED, resultText: null, errorMessage: 'ADAPTER_REPORTED_FAILURE', completedAt: asDate(adapter.completedAt) ?? new Date() },
    })
    await recordLifecycle({ context, memberId, executionId, taskId, eventType: 'runtime.execution.failed', activityType: TaskActivityType.RUNTIME_FAILED, summary: 'Hermes execution reported a safe failure' })
    return execution
  }

  const nextStatus = adapter.status === 'RUNNING' ? HermesExecutionStatus.RUNNING : HermesExecutionStatus.QUEUED
  const execution = await prisma.hermesExecution.update({ where: { id: executionId }, data: { ...common, status: nextStatus } })
  if (nextStatus === HermesExecutionStatus.RUNNING && current.status !== HermesExecutionStatus.RUNNING) {
    await recordLifecycle({ context, memberId, executionId, taskId, eventType: 'runtime.execution.started', activityType: TaskActivityType.RUNTIME_STARTED, summary: 'Hermes execution started' })
  }
  return execution
}

async function pollBounded(context: ProjectContext, memberId: string, execution: { id: string; taskId: string; externalExecutionId: string | null; status: HermesExecutionStatus }, adapter: HermesRuntimeAdapter) {
  let current = execution
  for (const delayMs of [250, 500, 1000]) {
    if (!current.externalExecutionId || !activeStatuses.includes(current.status)) break
    await new Promise(resolve => setTimeout(resolve, delayMs))
    const response = await adapter.getExecutionStatus(current.externalExecutionId)
    current = await persistAdapterStatus(context, memberId, current.id, current.taskId, response)
  }
  return current
}

export async function dispatchTaskToHermes(context: ProjectContext, taskId: string, adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  if (!canDispatchToHermes(context.project.role)) throw new HermesRuntimeError('FORBIDDEN')
  const member = await actorMember(context)

  const prepared = await prisma.$transaction(async tx => {
    // A transaction-scoped advisory lock makes the find/create guard atomic without
    // weakening project ownership or relying on client/UI state.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${taskId})::bigint)`
    const task = await tx.task.findFirst({ where: { id: taskId, projectId: context.project.id }, include: { assignments: true } })
    if (!task) throw new HermesRuntimeError('TASK_NOT_FOUND')
    const assignmentId = task.assignments.find(assignment => assignment.employeeProjectAssignmentId)?.employeeProjectAssignmentId
    if (!assignmentId) throw new HermesRuntimeError('EMPLOYEE_ASSIGNMENT_REQUIRED')
    const runtimeAssignment = await tx.hermesRuntimeAssignment.findFirst({
      where: {
        projectId: context.project.id,
        employeeProjectAssignmentId: assignmentId,
        active: true,
        runtime: { status: 'ACTIVE' },
        employeeAssignment: { status: 'ACTIVE' },
      },
      include: { runtime: true, employeeAssignment: { include: { employee: true } } },
    })
    if (!runtimeAssignment) throw new HermesRuntimeError('RUNTIME_ASSIGNMENT_NOT_FOUND')
    const existing = await tx.hermesExecution.findFirst({
      where: { projectId: context.project.id, taskId, status: { in: activeStatuses } },
      select: { id: true },
    })
    if (existing) throw new HermesRuntimeError('EXECUTION_ACTIVE')
    const execution = await tx.hermesExecution.create({
      data: {
        projectId: context.project.id,
        taskId,
        runtimeId: runtimeAssignment.runtimeId,
        runtimeAssignmentId: runtimeAssignment.id,
        // The adapter accepts UUID idempotency keys while RogerOS uses CUIDs.
        // Store the UUID before the network call so retries can never create
        // an uncontrolled second external execution.
        externalExecutionId: randomUUID(),
        prompt: task.description || task.title,
      },
    })
    return { execution, runtimeAssignment }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

  await recordLifecycle({ context, memberId: member.id, executionId: prepared.execution.id, taskId, eventType: 'runtime.execution.queued', activityType: TaskActivityType.RUNTIME_QUEUED, summary: 'Hermes execution queued' })
  try {
    await prisma.hermesExecution.update({ where: { id: prepared.execution.id }, data: { status: HermesExecutionStatus.DISPATCHING, startedAt: new Date() } })
    const response = await adapter.dispatchExecution({
      executionId: prepared.execution.externalExecutionId!,
      projectKey: 'rogeros-vhalam',
      runtimeProfileKey: prepared.runtimeAssignment.profileKey as 'rogeros-vhalam-chief-of-staff',
      employeeKey: 'chief-of-staff',
      taskInstruction: prepared.execution.prompt,
    })
    const saved = await persistAdapterStatus(context, member.id, prepared.execution.id, taskId, response)
    await pollBounded(context, member.id, saved, adapter)
    return getHermesExecution(context, prepared.execution.id)
  } catch (error) {
    await markFailed(context, member.id, prepared.execution.id, taskId, error)
    if (error instanceof HermesRuntimeError) throw error
    throw new HermesRuntimeError('ADAPTER_FAILURE')
  }
}

export async function getHermesExecution(context: ProjectContext, executionId: string) {
  const execution = await prisma.hermesExecution.findFirst({ where: { id: executionId, projectId: context.project.id } })
  if (!execution) throw new HermesRuntimeError('EXECUTION_NOT_FOUND')
  return execution
}

export async function refreshHermesExecution(context: ProjectContext, executionId: string, adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  const member = await actorMember(context)
  const execution = await getHermesExecution(context, executionId)
  if (!activeStatuses.includes(execution.status)) return execution
  if (!execution.externalExecutionId) return markFailed(context, member.id, execution.id, execution.taskId, new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE'))
  try {
    const response = await adapter.getExecutionStatus(execution.externalExecutionId)
    return persistAdapterStatus(context, member.id, execution.id, execution.taskId, response)
  } catch (error) {
    return markFailed(context, member.id, execution.id, execution.taskId, error)
  }
}
