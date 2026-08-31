import { NextResponse } from 'next/server'

import { HermesRuntimeError } from '@/lib/hermes-runtime'

export function runtimeErrorResponse(error: unknown) {
  if (!(error instanceof HermesRuntimeError)) throw error
  const status = error.code === 'FORBIDDEN' ? 403
    : error.code === 'TASK_NOT_FOUND' || error.code === 'EXECUTION_NOT_FOUND' ? 404
      : ['EXECUTION_ACTIVE', 'TASK_STATE_CONFLICT', 'CALLBACK_CONFLICT'].includes(error.code) ? 409
        : 400
  return NextResponse.json({ error: error.code }, { status })
}

export function safeExecution(execution: {
  id: string
  taskId: string
  runtimeId: string
  runtimeAssignmentId: string
  status: string
  resultText: string | null
  errorMessage: string | null
  startedAt: Date | null
  completedAt: Date | null
  reviewStatus: string | null
  reviewedAt: Date | null
  reviewNote: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: execution.id,
    taskId: execution.taskId,
    runtimeId: execution.runtimeId,
    runtimeAssignmentId: execution.runtimeAssignmentId,
    status: execution.status,
    resultText: execution.resultText,
    errorMessage: execution.errorMessage,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    reviewStatus: execution.reviewStatus,
    reviewedAt: execution.reviewedAt,
    reviewNote: execution.reviewNote,
    createdAt: execution.createdAt,
    updatedAt: execution.updatedAt,
  }
}
