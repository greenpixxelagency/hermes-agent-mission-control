import {
  AuditActorType,
  HermesExecutionReviewStatus,
  HermesExecutionStatus,
  Prisma,
  TaskActivityType,
  TaskStatus,
} from '@prisma/client'
import { randomUUID } from 'node:crypto'

import type { HermesAdapterExecution, HermesExecutionRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import { hermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'
import { canDispatchToHermes, canManageRuntimeAssignments, canReviewHermesResult } from '@/lib/hermes-runtime-rules'
import { getProjectBrainContextForTask } from '@/lib/drive-brain'
import { botProfileId, runtimeSlug } from '@/lib/hermes-bots'

const activeStatuses: HermesExecutionStatus[] = [HermesExecutionStatus.QUEUED, HermesExecutionStatus.DISPATCHING, HermesExecutionStatus.RUNNING]
const terminalStatuses: HermesExecutionStatus[] = [HermesExecutionStatus.SUCCEEDED, HermesExecutionStatus.FAILED, HermesExecutionStatus.CANCELLED]
const adapterStatuses = new Set(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'])
const MAX_RESULT_CHARACTERS = 20_000
const MAX_TASK_RESULT_CHARACTERS = 10_000
const MAX_REVIEW_NOTE_CHARACTERS = 2_000

type LifecycleActor = { type: AuditActorType; projectMemberId?: string; userId?: string }
type CallbackEvidence = { fingerprint: string; receivedAt: Date }

export class HermesRuntimeError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'HermesRuntimeError' }
}

export { canDispatchToHermes, canManageRuntimeAssignments, canReviewHermesResult }

function safeErrorCode(error: unknown) { return error instanceof HermesRuntimeError ? error.code : 'ADAPTER_FAILURE' }
function asDate(value: string | null) { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date }

async function serializableTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, 25 * (attempt + 1)))
    }
  }
  throw new HermesRuntimeError('TRANSACTION_RETRY_EXHAUSTED')
}

function validateAdapterExecution(value: HermesAdapterExecution): HermesAdapterExecution {
  if (!value || typeof value !== 'object' || typeof value.externalExecutionId !== 'string' || !value.externalExecutionId.trim() || !adapterStatuses.has(value.status)) throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  if (value.result !== undefined && typeof value.result !== 'string') throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  if (value.error !== undefined && typeof value.error !== 'string') throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  if (value.status === 'SUCCEEDED' && !value.result?.trim()) throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
  if ((value.result?.length ?? 0) > MAX_RESULT_CHARACTERS) throw new HermesRuntimeError('ADAPTER_RESULT_TOO_LARGE')
  return value
}

async function actorMember(context: ProjectContext) {
  const member = await prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } })
  if (!member) throw new HermesRuntimeError('FORBIDDEN')
  return member
}

function auditActor(actor: LifecycleActor) {
  return { actorType: actor.type, actorProjectMemberId: actor.type === AuditActorType.HUMAN ? actor.projectMemberId : null }
}

async function recordLifecycle(input: { projectId: string; executionId: string; taskId: string; eventType: string; activityType: TaskActivityType; summary: string; actor: LifecycleActor }) {
  await prisma.$transaction([
    prisma.taskActivity.create({ data: { projectId: input.projectId, taskId: input.taskId, actorUserId: input.actor.userId, type: input.activityType, detail: input.summary } }),
    prisma.auditEvent.create({ data: { projectId: input.projectId, eventType: input.eventType, ...auditActor(input.actor), targetType: 'HermesExecution', targetId: input.executionId, taskId: input.taskId, summary: input.summary, metadata: { executionId: input.executionId } } }),
  ])
}

async function persistAdapterStatus(input: { executionId: string; projectId?: string; response: HermesAdapterExecution; actor: LifecycleActor; callback?: CallbackEvidence }) {
  const adapter = validateAdapterExecution(input.response)
  return serializableTransaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.executionId})::bigint)`
    const current = await tx.hermesExecution.findFirst({ where: { id: input.executionId, ...(input.projectId ? { projectId: input.projectId } : {}) } })
    if (!current) throw new HermesRuntimeError('EXECUTION_NOT_FOUND')
    if (!current.externalExecutionId || current.externalExecutionId !== adapter.externalExecutionId) throw new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE')
    if (terminalStatuses.includes(current.status)) {
      if (input.callback) {
        const expectedStatus = adapter.status === 'SUCCEEDED' ? HermesExecutionStatus.SUCCEEDED : HermesExecutionStatus.FAILED
        const sameResult = adapter.status !== 'SUCCEEDED' || current.resultText === adapter.result?.trim()
        if (current.status !== expectedStatus || !sameResult || (current.callbackFingerprint && current.callbackFingerprint !== input.callback.fingerprint)) throw new HermesRuntimeError('CALLBACK_CONFLICT')
        if (!current.callbackFingerprint) return tx.hermesExecution.update({ where: { id: current.id }, data: { callbackReceivedAt: input.callback.receivedAt, callbackFingerprint: input.callback.fingerprint } })
      }
      return current
    }

    const common = { startedAt: asDate(adapter.startedAt) ?? current.startedAt ?? new Date(), ...(input.callback ? { callbackReceivedAt: input.callback.receivedAt, callbackFingerprint: input.callback.fingerprint } : {}) }
    const latest = await tx.hermesExecution.findFirst({ where: { projectId: current.projectId, taskId: current.taskId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } })
    const isLatest = latest?.id === current.id

    if (adapter.status === 'SUCCEEDED') {
      const result = adapter.result!.trim()
      const execution = await tx.hermesExecution.update({ where: { id: current.id }, data: { ...common, status: HermesExecutionStatus.SUCCEEDED, resultText: result, errorMessage: null, reviewStatus: HermesExecutionReviewStatus.PENDING, completedAt: asDate(adapter.completedAt) ?? new Date() } })
      if (isLatest) await tx.task.updateMany({ where: { id: current.taskId, projectId: current.projectId, status: TaskStatus.IN_PROGRESS }, data: { status: TaskStatus.REVIEW, resultSummary: result.slice(0, MAX_TASK_RESULT_CHARACTERS), completedAt: null } })
      await tx.taskActivity.create({ data: { projectId: current.projectId, taskId: current.taskId, actorUserId: input.actor.userId, type: TaskActivityType.RUNTIME_SUCCEEDED, detail: isLatest ? 'AI work is ready for review' : 'An older AI execution completed without changing the task' } })
      await tx.auditEvent.create({ data: { projectId: current.projectId, eventType: 'runtime.execution.succeeded', ...auditActor(input.actor), targetType: 'HermesExecution', targetId: current.id, taskId: current.taskId, summary: 'Hermes execution completed successfully', metadata: { executionId: current.id, completionSource: input.callback ? 'callback' : 'synchronization', taskMovedToReview: isLatest } } })
      if (isLatest) await tx.auditEvent.create({ data: { projectId: current.projectId, eventType: 'task.review.ready', ...auditActor(input.actor), targetType: 'Task', targetId: current.taskId, taskId: current.taskId, summary: 'AI work moved to human review', metadata: { executionId: current.id } } })
      return execution
    }

    if (adapter.status === 'FAILED') {
      const execution = await tx.hermesExecution.update({ where: { id: current.id }, data: { ...common, status: HermesExecutionStatus.FAILED, resultText: null, errorMessage: 'RUNTIME_EXECUTION_FAILED', reviewStatus: null, completedAt: asDate(adapter.completedAt) ?? new Date() } })
      if (isLatest) await tx.task.updateMany({ where: { id: current.taskId, projectId: current.projectId, status: TaskStatus.IN_PROGRESS }, data: { status: TaskStatus.BLOCKED, resultSummary: null, completedAt: null } })
      await tx.taskActivity.create({ data: { projectId: current.projectId, taskId: current.taskId, actorUserId: input.actor.userId, type: TaskActivityType.RUNTIME_FAILED, detail: isLatest ? 'AI work needs attention and can be retried safely' : 'An older AI execution failed without changing the task' } })
      await tx.auditEvent.create({ data: { projectId: current.projectId, eventType: 'runtime.execution.failed', ...auditActor(input.actor), targetType: 'HermesExecution', targetId: current.id, taskId: current.taskId, summary: 'Hermes execution failed safely', metadata: { executionId: current.id, completionSource: input.callback ? 'callback' : 'synchronization', taskBlocked: isLatest } } })
      return execution
    }

    const nextStatus = adapter.status === 'RUNNING' ? HermesExecutionStatus.RUNNING : HermesExecutionStatus.QUEUED
    const execution = await tx.hermesExecution.update({ where: { id: current.id }, data: { ...common, status: nextStatus } })
    if (nextStatus === HermesExecutionStatus.RUNNING && current.status !== HermesExecutionStatus.RUNNING) {
      await tx.taskActivity.create({ data: { projectId: current.projectId, taskId: current.taskId, actorUserId: input.actor.userId, type: TaskActivityType.RUNTIME_STARTED, detail: 'AI employee started work' } })
      await tx.auditEvent.create({ data: { projectId: current.projectId, eventType: 'runtime.execution.started', ...auditActor(input.actor), targetType: 'HermesExecution', targetId: current.id, taskId: current.taskId, summary: 'Hermes execution started', metadata: { executionId: current.id } } })
    }
    return execution
  })
}

async function markFailed(context: ProjectContext, memberId: string, executionId: string, error: unknown) {
  const execution = await getHermesExecution(context, executionId)
  return persistAdapterStatus({ executionId, projectId: context.project.id, actor: { type: AuditActorType.HUMAN, projectMemberId: memberId, userId: context.user.id }, response: { externalExecutionId: execution.externalExecutionId ?? '', status: 'FAILED', startedAt: execution.startedAt?.toISOString() ?? null, completedAt: new Date().toISOString(), error: safeErrorCode(error) } })
}

async function pollBounded(context: ProjectContext, memberId: string, execution: { id: string; externalExecutionId: string | null; status: HermesExecutionStatus }, adapter: HermesExecutionRuntimeAdapter) {
  let current = execution
  for (const delayMs of [250, 500, 1000]) {
    if (!current.externalExecutionId || !activeStatuses.includes(current.status)) break
    await new Promise(resolve => setTimeout(resolve, delayMs))
    const response = await adapter.getExecutionStatus(current.externalExecutionId)
    current = await persistAdapterStatus({ executionId: current.id, projectId: context.project.id, response, actor: { type: AuditActorType.HUMAN, projectMemberId: memberId, userId: context.user.id } })
  }
  return current
}

export async function dispatchTaskToHermes(context: ProjectContext, taskId: string, adapter: HermesExecutionRuntimeAdapter = hermesRuntimeAdapter, options: { retryOfExecutionId?: string } = {}) {
  if (!canDispatchToHermes(context.project.role)) throw new HermesRuntimeError('FORBIDDEN')
  const member = await actorMember(context)
  const prepared = await serializableTransaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${taskId})::bigint)`
    const task = await tx.task.findFirst({ where: { id: taskId, projectId: context.project.id }, include: { assignments: true } })
    if (!task) throw new HermesRuntimeError('TASK_NOT_FOUND')
    if (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED || task.status === TaskStatus.REVIEW) throw new HermesRuntimeError('TASK_NOT_DISPATCHABLE')
    if (task.status === TaskStatus.BLOCKED && !options.retryOfExecutionId) throw new HermesRuntimeError('RETRY_REQUIRED')
    const latest = await tx.hermesExecution.findFirst({ where: { projectId: context.project.id, taskId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
    if (options.retryOfExecutionId && (latest?.id !== options.retryOfExecutionId || latest.status !== HermesExecutionStatus.FAILED || task.status !== TaskStatus.BLOCKED)) throw new HermesRuntimeError('RETRY_NOT_ALLOWED')
    const assignmentId = task.assignments.find(assignment => assignment.employeeProjectAssignmentId)?.employeeProjectAssignmentId
    if (!assignmentId) throw new HermesRuntimeError('EMPLOYEE_ASSIGNMENT_REQUIRED')
    const runtimeAssignment = await tx.hermesRuntimeAssignment.findFirst({ where: { projectId: context.project.id, employeeProjectAssignmentId: assignmentId, active: true, assignmentState: 'ACTIVE', runtime: { status: 'ACTIVE' }, employeeAssignment: { status: 'ACTIVE' } }, include: { runtime: true, employeeAssignment: { include: { employee: true } } } })
    if (!runtimeAssignment?.employeeAssignment) throw new HermesRuntimeError('RUNTIME_ASSIGNMENT_NOT_FOUND')
    const expectedProfile = botProfileId(context.project.slug, runtimeAssignment.employeeAssignment.employee.systemKey || runtimeAssignment.employeeAssignment.employee.name)
    if (runtimeAssignment.profileKey !== expectedProfile) throw new HermesRuntimeError('INVALID_RUNTIME_IDENTITY')
    const existing = await tx.hermesExecution.findFirst({ where: { projectId: context.project.id, taskId, status: { in: activeStatuses } }, select: { id: true } })
    if (existing) throw new HermesRuntimeError('EXECUTION_ACTIVE')
    const revision = latest?.reviewStatus === HermesExecutionReviewStatus.REVISION_REQUESTED && latest.reviewNote?.trim() ? `\n\nReviewer feedback for this revision:\n${latest.reviewNote.trim().slice(0, MAX_REVIEW_NOTE_CHARACTERS)}` : ''
    const execution = await tx.hermesExecution.create({ data: { projectId: context.project.id, taskId, runtimeId: runtimeAssignment.runtimeId, runtimeAssignmentId: runtimeAssignment.id, externalExecutionId: randomUUID(), prompt: `${task.description || task.title}${revision}` } })
    const changed = await tx.task.updateMany({ where: { id: taskId, projectId: context.project.id, status: task.status }, data: { status: TaskStatus.IN_PROGRESS, startedAt: task.startedAt ?? new Date(), completedAt: null, resultSummary: null } })
    if (changed.count !== 1) throw new HermesRuntimeError('TASK_STATE_CONFLICT')
    await tx.taskActivity.create({ data: { projectId: context.project.id, taskId, actorUserId: context.user.id, type: TaskActivityType.STATUS_CHANGED, detail: options.retryOfExecutionId ? 'AI work retry accepted' : 'AI work accepted and moved to in progress' } })
    return { execution, runtimeAssignment, employeeKey: runtimeSlug(runtimeAssignment.employeeAssignment.employee.systemKey || runtimeAssignment.employeeAssignment.employee.name) }
  })

  const actor = { type: AuditActorType.HUMAN, projectMemberId: member.id, userId: context.user.id }
  await recordLifecycle({ projectId: context.project.id, executionId: prepared.execution.id, taskId, eventType: options.retryOfExecutionId ? 'runtime.execution.retry_requested' : 'runtime.execution.queued', activityType: TaskActivityType.RUNTIME_QUEUED, summary: options.retryOfExecutionId ? 'AI work retry queued' : 'Hermes execution queued', actor })
  await prisma.auditEvent.create({ data: { projectId: context.project.id, eventType: 'runtime.execution.accepted', ...auditActor(actor), targetType: 'HermesExecution', targetId: prepared.execution.id, taskId, summary: 'AI work accepted by RogerOS', metadata: { executionId: prepared.execution.id, retryOfExecutionId: options.retryOfExecutionId ?? null } } })
  try {
    await prisma.hermesExecution.update({ where: { id: prepared.execution.id }, data: { status: HermesExecutionStatus.DISPATCHING, startedAt: new Date() } })
    const brain = await getProjectBrainContextForTask({ projectId: context.project.id, query: prepared.execution.prompt, maxSources: 4, maxCharacters: 8_000 })
    const contextBlock = brain.length ? `\n\nAuthorized Project Brain context (use only when relevant):\n${brain.map(item => `[Source: ${item.provenance.name}; Drive file: ${item.provenance.fileId}]\n${item.content}`).join('\n\n')}` : ''
    const response = await adapter.dispatchExecution({ executionId: prepared.execution.externalExecutionId!, projectKey: `rogeros-${runtimeSlug(context.project.slug)}`, runtimeProfileKey: prepared.runtimeAssignment.profileKey, employeeKey: prepared.employeeKey, taskInstruction: `${prepared.execution.prompt}${contextBlock}` })
    const saved = await persistAdapterStatus({ executionId: prepared.execution.id, projectId: context.project.id, response, actor })
    await pollBounded(context, member.id, saved, adapter)
    return getHermesExecution(context, prepared.execution.id)
  } catch (error) {
    await markFailed(context, member.id, prepared.execution.id, error)
    if (error instanceof HermesRuntimeError) throw error
    throw new HermesRuntimeError('ADAPTER_FAILURE')
  }
}

export async function getHermesExecution(context: ProjectContext, executionId: string) {
  const execution = await prisma.hermesExecution.findFirst({ where: { id: executionId, projectId: context.project.id } })
  if (!execution) throw new HermesRuntimeError('EXECUTION_NOT_FOUND')
  return execution
}

export async function refreshHermesExecution(context: ProjectContext, executionId: string, adapter: HermesExecutionRuntimeAdapter = hermesRuntimeAdapter) {
  const member = await actorMember(context)
  const execution = await getHermesExecution(context, executionId)
  if (!activeStatuses.includes(execution.status)) return execution
  if (!execution.externalExecutionId) return markFailed(context, member.id, execution.id, new HermesRuntimeError('ADAPTER_MALFORMED_RESPONSE'))
  try { return persistAdapterStatus({ executionId: execution.id, projectId: context.project.id, response: await adapter.getExecutionStatus(execution.externalExecutionId), actor: { type: AuditActorType.HUMAN, projectMemberId: member.id, userId: context.user.id } }) }
  catch (error) { return markFailed(context, member.id, execution.id, error) }
}

export async function applyHermesCompletionCallback(response: HermesAdapterExecution, evidence: CallbackEvidence) {
  const adapter = validateAdapterExecution(response)
  if (adapter.status !== 'SUCCEEDED' && adapter.status !== 'FAILED') throw new HermesRuntimeError('CALLBACK_NOT_TERMINAL')
  const execution = await prisma.hermesExecution.findUnique({ where: { externalExecutionId: adapter.externalExecutionId }, select: { id: true } })
  if (!execution) throw new HermesRuntimeError('EXECUTION_NOT_FOUND')
  return persistAdapterStatus({ executionId: execution.id, response: adapter, actor: { type: AuditActorType.SYSTEM }, callback: evidence })
}

export async function reviewHermesExecution(context: ProjectContext, executionId: string, action: 'ACCEPT' | 'REQUEST_REVISION', note?: string) {
  if (!canReviewHermesResult(context.project.role)) throw new HermesRuntimeError('FORBIDDEN')
  const member = await actorMember(context)
  const reviewNote = note?.trim().slice(0, MAX_REVIEW_NOTE_CHARACTERS) || null
  return serializableTransaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${executionId})::bigint)`
    const execution = await tx.hermesExecution.findFirst({ where: { id: executionId, projectId: context.project.id } })
    if (!execution) throw new HermesRuntimeError('EXECUTION_NOT_FOUND')
    if (execution.status !== HermesExecutionStatus.SUCCEEDED || execution.reviewStatus !== HermesExecutionReviewStatus.PENDING) throw new HermesRuntimeError('REVIEW_NOT_ALLOWED')
    const latest = await tx.hermesExecution.findFirst({ where: { projectId: context.project.id, taskId: execution.taskId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } })
    if (latest?.id !== execution.id) throw new HermesRuntimeError('STALE_EXECUTION')
    const accepted = action === 'ACCEPT'
    const task = await tx.task.updateMany({ where: { id: execution.taskId, projectId: context.project.id, status: TaskStatus.REVIEW }, data: { status: accepted ? TaskStatus.DONE : TaskStatus.TODO, completedAt: accepted ? new Date() : null, ...(accepted ? {} : { resultSummary: null }) } })
    if (task.count !== 1) throw new HermesRuntimeError('TASK_STATE_CONFLICT')
    const updated = await tx.hermesExecution.update({ where: { id: execution.id }, data: { reviewStatus: accepted ? HermesExecutionReviewStatus.ACCEPTED : HermesExecutionReviewStatus.REVISION_REQUESTED, reviewedByProjectMemberId: member.id, reviewedAt: new Date(), reviewNote } })
    await tx.taskActivity.create({ data: { projectId: context.project.id, taskId: execution.taskId, actorUserId: context.user.id, type: accepted ? TaskActivityType.COMPLETED : TaskActivityType.STATUS_CHANGED, detail: accepted ? 'AI result accepted and task completed' : 'Revision requested; prior result preserved' } })
    await tx.auditEvent.create({ data: { projectId: context.project.id, eventType: accepted ? 'runtime.execution.review_accepted' : 'runtime.execution.revision_requested', actorType: AuditActorType.HUMAN, actorProjectMemberId: member.id, targetType: 'HermesExecution', targetId: execution.id, taskId: execution.taskId, summary: accepted ? 'Human reviewer accepted the AI result' : 'Human reviewer requested a revision', metadata: { executionId: execution.id, noteProvided: Boolean(reviewNote) } } })
    return updated
  })
}

export async function retryHermesExecution(context: ProjectContext, executionId: string, adapter: HermesExecutionRuntimeAdapter = hermesRuntimeAdapter) {
  if (!canDispatchToHermes(context.project.role)) throw new HermesRuntimeError('FORBIDDEN')
  const execution = await getHermesExecution(context, executionId)
  if (execution.status !== HermesExecutionStatus.FAILED) throw new HermesRuntimeError('RETRY_NOT_ALLOWED')
  return dispatchTaskToHermes(context, execution.taskId, adapter, { retryOfExecutionId: execution.id })
}
