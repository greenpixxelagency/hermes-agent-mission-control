import { AuditActorType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const forbidden = /token|secret|password|authorization|cookie|database[_-]?url|api[_-]?key/i

export type AuditActor = { type: AuditActorType; projectMemberId?: string; employeeAssignmentId?: string }

export function safeMetadata(value: unknown): Prisma.InputJsonValue {
  if (value === null) return Prisma.JsonNull as unknown as Prisma.InputJsonValue
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.length > 2000 ? value.slice(0, 2000) : value
  if (Array.isArray(value)) return value.map(safeMetadata) as Prisma.InputJsonValue
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !forbidden.test(key)).map(([key, entry]) => [key, safeMetadata(entry)])) as Prisma.InputJsonValue
}

export async function recordAuditEvent(input: { projectId: string; eventType: string; actor: AuditActor; targetType: string; targetId?: string; taskId?: string; approvalRequestId?: string; projectToolId?: string; summary: string; metadata?: unknown }) {
  if ((input.actor.type === AuditActorType.HUMAN && !input.actor.projectMemberId) || (input.actor.type === AuditActorType.EMPLOYEE && !input.actor.employeeAssignmentId)) throw new Error('INVALID_AUDIT_ACTOR')
  return prisma.auditEvent.create({ data: { projectId: input.projectId, eventType: input.eventType, actorType: input.actor.type, actorProjectMemberId: input.actor.projectMemberId, actorEmployeeAssignmentId: input.actor.employeeAssignmentId, targetType: input.targetType, targetId: input.targetId, taskId: input.taskId, approvalRequestId: input.approvalRequestId, projectToolId: input.projectToolId, summary: input.summary, metadata: safeMetadata(input.metadata ?? {}) } })
}
