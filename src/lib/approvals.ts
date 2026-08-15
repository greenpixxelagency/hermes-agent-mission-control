import { ApprovalStatus, AuditActorType, ProjectRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { safeMetadata } from '@/lib/audit'
import { canDecideApproval, canTransitionApproval, isSafeActionContext } from '@/lib/approval-rules'
import { resolveToolAuthorization } from '@/lib/tool-permissions'

type CreateInput = { projectId: string; employeeProjectAssignmentId?: string; requestedByProjectMemberId?: string; projectToolId: string; action: string; capabilityKey?: string; summary: string; actionContext: Record<string, unknown>; taskId?: string; threadId?: string; expiresAt?: Date }

export async function createApprovalRequestFromAuthorization(input: CreateInput) {
  if (!input.summary.trim() || !isSafeActionContext(input.actionContext)) throw new Error('INVALID_APPROVAL_CONTEXT')
  if (!input.employeeProjectAssignmentId && !input.requestedByProjectMemberId) throw new Error('MISSING_REQUESTER')
  const [assignment, requester, tool, task, thread] = await Promise.all([
    input.employeeProjectAssignmentId ? prisma.employeeProjectAssignment.findFirst({ where: { id: input.employeeProjectAssignmentId, projectId: input.projectId }, select: { id: true } }) : null,
    input.requestedByProjectMemberId ? prisma.projectMember.findFirst({ where: { id: input.requestedByProjectMemberId, projectId: input.projectId }, select: { id: true } }) : null,
    prisma.projectTool.findFirst({ where: { id: input.projectToolId, projectId: input.projectId }, include: { tool: true } }),
    input.taskId ? prisma.task.findFirst({ where: { id: input.taskId, projectId: input.projectId }, select: { id: true } }) : null,
    input.threadId ? prisma.thread.findFirst({ where: { id: input.threadId, projectId: input.projectId }, select: { id: true } }) : null,
  ])
  if ((input.employeeProjectAssignmentId && !assignment) || (input.requestedByProjectMemberId && !requester) || !tool || (input.taskId && !task) || (input.threadId && !thread)) throw new Error('PROJECT_RESOURCE_NOT_FOUND')
  const decision = input.employeeProjectAssignmentId ? await resolveToolAuthorization({ projectId: input.projectId, assignmentId: input.employeeProjectAssignmentId, projectToolId: input.projectToolId, action: input.action, capabilityKey: input.capabilityKey }) : 'DENY'
  if (decision !== 'REQUIRE_APPROVAL') throw new Error('APPROVAL_NOT_AUTHORIZED')
  const [permission, policies] = await Promise.all([
    prisma.employeeToolPermission.findFirst({ where: { projectId: input.projectId, employeeProjectAssignmentId: input.employeeProjectAssignmentId!, projectToolId: input.projectToolId }, select: { level: true, capabilityKey: true } }),
    prisma.policy.findMany({ where: { projectId: input.projectId, status: 'ACTIVE' }, select: { id: true, title: true, enforcement: true, rule: true } }),
  ])
  const matchingPolicies = policies.filter(policy => policy.rule && typeof policy.rule === 'object' && !Array.isArray(policy.rule) && (policy.rule as { action?: unknown }).action === input.action)
  const authorizationSnapshot = safeMetadata({ decision, action: input.action, capabilityKey: input.capabilityKey ?? '*', permissionLevel: permission?.level ?? null, toolKey: tool.tool.key, projectToolId: tool.id })
  const policySnapshot = safeMetadata(matchingPolicies.map(policy => ({ id: policy.id, title: policy.title, enforcement: policy.enforcement, rule: policy.rule })))
  const request = await prisma.$transaction(async tx => {
    const created = await tx.approvalRequest.create({ data: { projectId: input.projectId, requestedByEmployeeAssignmentId: input.employeeProjectAssignmentId, requestedByProjectMemberId: input.requestedByProjectMemberId, projectToolId: input.projectToolId, taskId: input.taskId, threadId: input.threadId, capabilityKey: input.capabilityKey ?? permission?.capabilityKey ?? '*', actionKey: input.action, summary: input.summary.trim(), actionContext: safeMetadata(input.actionContext), authorizationSnapshot, policySnapshot, permissionLevel: permission?.level, expiresAt: input.expiresAt } })
    await tx.auditEvent.create({ data: { projectId: input.projectId, eventType: 'authorization.require_approval', actorType: input.employeeProjectAssignmentId ? AuditActorType.EMPLOYEE : AuditActorType.HUMAN, actorEmployeeAssignmentId: input.employeeProjectAssignmentId, actorProjectMemberId: input.requestedByProjectMemberId, targetType: 'ApprovalRequest', targetId: created.id, approvalRequestId: created.id, projectToolId: input.projectToolId, summary: 'Authorization requires human approval', metadata: authorizationSnapshot } })
    await tx.auditEvent.create({ data: { projectId: input.projectId, eventType: 'approval.requested', actorType: input.employeeProjectAssignmentId ? AuditActorType.EMPLOYEE : AuditActorType.HUMAN, actorEmployeeAssignmentId: input.employeeProjectAssignmentId, actorProjectMemberId: input.requestedByProjectMemberId, targetType: 'ApprovalRequest', targetId: created.id, approvalRequestId: created.id, projectToolId: input.projectToolId, taskId: input.taskId, summary: `Approval requested: ${created.summary}`, metadata: { action: input.action, capabilityKey: created.capabilityKey } } })
    return created
  })
  return request
}

export async function decideApprovalRequest(input: { projectId: string; approvalId: string; approverProjectMemberId: string; outcome: 'APPROVED' | 'REJECTED'; note?: string }) {
  const approver = await prisma.projectMember.findFirst({ where: { id: input.approverProjectMemberId, projectId: input.projectId }, select: { id: true, role: true } })
  if (!approver || !canDecideApproval(approver.role)) throw new Error('FORBIDDEN')
  const request = await prisma.approvalRequest.findFirst({ where: { id: input.approvalId, projectId: input.projectId }, select: { id: true, status: true, expiresAt: true, requestedByProjectMemberId: true, summary: true, projectToolId: true, taskId: true } })
  if (!request) throw new Error('NOT_FOUND')
  if (request.requestedByProjectMemberId === approver.id) throw new Error('SELF_APPROVAL_FORBIDDEN')
  const expired = !!request.expiresAt && request.expiresAt <= new Date()
  if (!canTransitionApproval(request.status, input.outcome, expired)) throw new Error(expired ? 'EXPIRED' : 'INVALID_APPROVAL_STATE')
  const status = expired ? ApprovalStatus.EXPIRED : ApprovalStatus[input.outcome]
  const updated = await prisma.$transaction(async tx => {
    if (expired) { await tx.approvalRequest.updateMany({ where: { id: request.id, projectId: input.projectId, status: ApprovalStatus.PENDING }, data: { status: ApprovalStatus.EXPIRED } }); throw new Error('EXPIRED') }
    const result = await tx.approvalRequest.updateMany({ where: { id: request.id, projectId: input.projectId, status: ApprovalStatus.PENDING }, data: { status, decidedAt: new Date(), decidedByProjectMemberId: approver.id, decisionNote: input.note?.trim() || null } })
    if (result.count !== 1) throw new Error('INVALID_APPROVAL_STATE')
    await tx.auditEvent.create({ data: { projectId: input.projectId, eventType: input.outcome === 'APPROVED' ? 'approval.approved' : 'approval.rejected', actorType: AuditActorType.HUMAN, actorProjectMemberId: approver.id, targetType: 'ApprovalRequest', targetId: request.id, approvalRequestId: request.id, projectToolId: request.projectToolId, taskId: request.taskId, summary: `Approval ${input.outcome.toLowerCase()}: ${request.summary}`, metadata: { decisionNote: input.note?.trim() || null } } })
    return tx.approvalRequest.findFirstOrThrow({ where: { id: request.id, projectId: input.projectId } })
  })
  return updated
}

export async function cancelApprovalRequest(input: { projectId: string; approvalId: string; requesterProjectMemberId: string }) {
  const request = await prisma.approvalRequest.findFirst({ where: { id: input.approvalId, projectId: input.projectId, requestedByProjectMemberId: input.requesterProjectMemberId }, select: { id: true, status: true, summary: true, projectToolId: true } })
  if (!request || !canTransitionApproval(request.status, 'CANCELLED')) throw new Error('NOT_FOUND_OR_NOT_CANCELLABLE')
  const result = await prisma.$transaction(async tx => {
    const changed = await tx.approvalRequest.updateMany({ where: { id: request.id, projectId: input.projectId, status: ApprovalStatus.PENDING }, data: { status: ApprovalStatus.CANCELLED } })
    if (changed.count !== 1) throw new Error('INVALID_APPROVAL_STATE')
    await tx.auditEvent.create({ data: { projectId: input.projectId, eventType: 'approval.cancelled', actorType: AuditActorType.HUMAN, actorProjectMemberId: input.requesterProjectMemberId, targetType: 'ApprovalRequest', targetId: request.id, approvalRequestId: request.id, projectToolId: request.projectToolId, summary: `Approval cancelled: ${request.summary}`, metadata: {} } })
    return changed.count
  })
  return result
}

export const approvalRoleAllowed = (role: ProjectRole) => canDecideApproval(role)
