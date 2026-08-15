import { createHash } from 'node:crypto'
import { ApprovalStatus, AuditActorType, ConnectionStatus, ToolExecutionStatus } from '@prisma/client'
import { createApprovalRequestFromAuthorization } from '@/lib/approvals'
import { recordAuditEvent, safeMetadata } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { toolAdapterFor } from '@/lib/tool-adapters'
import { resolveToolAuthorization } from '@/lib/tool-permissions'
import { upsertDriveBrainSource } from '@/lib/drive-brain'

type Request = { projectId: string; employeeProjectAssignmentId: string; projectToolId: string; capabilityKey: string; actionKey: 'read' | 'execute'; request?: Record<string, unknown>; summary: string }
export class ToolExecutionError extends Error { constructor(public readonly code: string) { super(code); this.name = 'ToolExecutionError' } }

function fingerprint(value: unknown) { return createHash('sha256').update(JSON.stringify(safeMetadata(value))).digest('hex') }
function safeRequest(value: Record<string, unknown> | undefined) { return safeMetadata(value ?? {}) as Record<string, unknown> }
async function employee(input: Request) {
  const assignment = await prisma.employeeProjectAssignment.findFirst({ where: { id: input.employeeProjectAssignmentId, projectId: input.projectId, status: 'ACTIVE' }, select: { id: true } })
  if (!assignment) throw new ToolExecutionError('EMPLOYEE_ASSIGNMENT_NOT_FOUND')
  return assignment
}
async function resources(input: Request) {
  const tool = await prisma.projectTool.findFirst({ where: { id: input.projectToolId, projectId: input.projectId, status: 'CONNECTED' }, include: { tool: { include: { capabilities: true } } } })
  if (!tool) throw new ToolExecutionError('PROJECT_TOOL_NOT_CONNECTED')
  if (!tool.tool.capabilities.some(capability => capability.key === input.capabilityKey)) throw new ToolExecutionError('CAPABILITY_NOT_FOUND')
  const connection = await prisma.projectConnection.findFirst({ where: { projectId: input.projectId, projectToolId: tool.id, enabled: true, status: ConnectionStatus.CONNECTED } })
  if (!connection) throw new ToolExecutionError('CONNECTION_NOT_AVAILABLE')
  return { tool, connection }
}
async function audit(input: { projectId: string; assignmentId: string; executionId: string; projectToolId: string; event: string; summary: string; metadata?: unknown; approvalRequestId?: string }) {
  return recordAuditEvent({ projectId: input.projectId, eventType: input.event, actor: { type: AuditActorType.EMPLOYEE, employeeAssignmentId: input.assignmentId }, targetType: 'ToolExecution', targetId: input.executionId, projectToolId: input.projectToolId, approvalRequestId: input.approvalRequestId, summary: input.summary, metadata: input.metadata })
}
async function executeStored(executionId: string) {
  const execution = await prisma.toolExecution.findUnique({ where: { id: executionId }, include: { projectTool: { include: { tool: true } }, connection: true } })
  if (!execution) throw new ToolExecutionError('EXECUTION_NOT_FOUND')
  try {
    await prisma.toolExecution.update({ where: { id: execution.id }, data: { status: ToolExecutionStatus.RUNNING, startedAt: new Date() } })
    await audit({ projectId: execution.projectId, assignmentId: execution.employeeProjectAssignmentId, executionId: execution.id, projectToolId: execution.projectToolId, event: 'tool.execution.started', summary: 'Governed tool execution started' })
    const result = await toolAdapterFor(execution.projectTool.tool.key).execute({ projectId: execution.projectId, connectionId: execution.projectConnectionId, capabilityKey: execution.capabilityKey, actionKey: execution.actionKey as 'read' | 'execute', request: execution.requestMetadata as Record<string, unknown> })
    if (!result || typeof result.resultText !== 'string' || !result.resultText.trim()) throw new ToolExecutionError('ADAPTER_MALFORMED_RESPONSE')
    const saved = await prisma.toolExecution.update({ where: { id: execution.id }, data: { status: ToolExecutionStatus.SUCCEEDED, resultText: result.resultText.slice(0, 20000), resultMetadata: safeMetadata(result.metadata ?? {}), completedAt: new Date(), errorMessage: null } })
    if (execution.projectTool.tool.key === 'google_drive' && execution.capabilityKey === 'drive_read') {
      const metadata = result.metadata ?? {}; const fileId = typeof metadata.fileId === 'string' ? metadata.fileId : ''
      const name = typeof metadata.name === 'string' ? metadata.name : 'Google Drive file'; const mimeType = typeof metadata.mimeType === 'string' ? metadata.mimeType : 'text/plain'
      const scope = fileId ? await prisma.projectConnectionScope.findFirst({ where: { projectId: execution.projectId, connectionId: execution.projectConnectionId, type: 'FILE', externalId: fileId }, select: { id: true } }) : null
      if (!fileId || !scope) throw new ToolExecutionError('DRIVE_SCOPE_DENIED')
      await upsertDriveBrainSource({ projectId: execution.projectId, connectionId: execution.projectConnectionId, scopeId: scope.id, externalFileId: fileId, parentExternalId: typeof metadata.parentId === 'string' ? metadata.parentId : undefined, name, mimeType, webUrl: typeof metadata.webUrl === 'string' ? metadata.webUrl : undefined, modifiedAt: typeof metadata.modifiedAt === 'string' ? new Date(metadata.modifiedAt) : undefined, content: result.resultText })
    }
    await audit({ projectId: execution.projectId, assignmentId: execution.employeeProjectAssignmentId, executionId: execution.id, projectToolId: execution.projectToolId, approvalRequestId: execution.approvalRequestId ?? undefined, event: 'tool.execution.succeeded', summary: 'Governed tool execution succeeded' })
    return saved
  } catch (error) {
    const saved = await prisma.toolExecution.update({ where: { id: execution.id }, data: { status: ToolExecutionStatus.FAILED, errorMessage: error instanceof ToolExecutionError ? error.code : 'ADAPTER_FAILURE', completedAt: new Date() } })
    await audit({ projectId: execution.projectId, assignmentId: execution.employeeProjectAssignmentId, executionId: execution.id, projectToolId: execution.projectToolId, approvalRequestId: execution.approvalRequestId ?? undefined, event: 'tool.execution.failed', summary: 'Governed tool execution failed safely' })
    return saved
  }
}

export async function executeToolAction(input: Request) {
  const allowed = (input.capabilityKey === 'reference_read' && input.actionKey === 'read') || (input.capabilityKey === 'reference_execute' && input.actionKey === 'execute') || (['drive_health', 'drive_list', 'drive_metadata', 'drive_read', 'drive_search'].includes(input.capabilityKey) && input.actionKey === 'read')
  if (!input.summary.trim() || !allowed) throw new ToolExecutionError('INVALID_TOOL_ACTION')
  await employee(input); const { tool, connection } = await resources(input)
  const request = safeRequest(input.request); const requestFingerprint = fingerprint({ capabilityKey: input.capabilityKey, actionKey: input.actionKey, request })
  const decision = await resolveToolAuthorization({ projectId: input.projectId, assignmentId: input.employeeProjectAssignmentId, projectToolId: tool.id, action: input.actionKey, capabilityKey: input.capabilityKey })
  const execution = await prisma.toolExecution.create({ data: { projectId: input.projectId, employeeProjectAssignmentId: input.employeeProjectAssignmentId, projectToolId: tool.id, projectConnectionId: connection.id, capabilityKey: input.capabilityKey, actionKey: input.actionKey, requestFingerprint, requestMetadata: safeMetadata(request), status: decision === 'REQUIRE_APPROVAL' ? ToolExecutionStatus.PENDING_APPROVAL : ToolExecutionStatus.REQUESTED } })
  await audit({ projectId: input.projectId, assignmentId: input.employeeProjectAssignmentId, executionId: execution.id, projectToolId: tool.id, event: 'tool.execution.requested', summary: input.summary, metadata: { capabilityKey: input.capabilityKey, actionKey: input.actionKey, decision } })
  if (decision === 'DENY') { const denied = await prisma.toolExecution.update({ where: { id: execution.id }, data: { status: ToolExecutionStatus.FAILED, errorMessage: 'DENIED', completedAt: new Date() } }); await audit({ projectId: input.projectId, assignmentId: input.employeeProjectAssignmentId, executionId: execution.id, projectToolId: tool.id, event: 'tool.execution.denied', summary: 'Tool action denied before adapter execution' }); return denied }
  if (decision === 'REQUIRE_APPROVAL') {
    const approval = await createApprovalRequestFromAuthorization({ projectId: input.projectId, employeeProjectAssignmentId: input.employeeProjectAssignmentId, projectToolId: tool.id, action: input.actionKey, capabilityKey: input.capabilityKey, summary: input.summary, actionContext: { fingerprint: requestFingerprint, capabilityKey: input.capabilityKey, actionKey: input.actionKey } })
    const pending = await prisma.toolExecution.update({ where: { id: execution.id }, data: { approvalRequestId: approval.id, status: ToolExecutionStatus.PENDING_APPROVAL } })
    await audit({ projectId: input.projectId, assignmentId: input.employeeProjectAssignmentId, executionId: execution.id, projectToolId: tool.id, approvalRequestId: approval.id, event: 'tool.execution.approval_required', summary: 'Tool action is pending human approval' })
    return pending
  }
  return executeStored(execution.id)
}

export async function executeApprovedToolAction(input: { projectId: string; executionId: string }) {
  const execution = await prisma.toolExecution.findFirst({ where: { id: input.executionId, projectId: input.projectId }, include: { approvalRequest: true } })
  if (!execution || !execution.approvalRequestId || !execution.approvalRequest) throw new ToolExecutionError('APPROVAL_EXECUTION_NOT_FOUND')
  const approval = execution.approvalRequest
  const context = approval.actionContext as { fingerprint?: unknown; capabilityKey?: unknown; actionKey?: unknown }
  if (approval.status !== ApprovalStatus.APPROVED || context.fingerprint !== execution.requestFingerprint || context.capabilityKey !== execution.capabilityKey || context.actionKey !== execution.actionKey) throw new ToolExecutionError('APPROVAL_SNAPSHOT_MISMATCH')
  const decision = await resolveToolAuthorization({ projectId: input.projectId, assignmentId: execution.employeeProjectAssignmentId, projectToolId: execution.projectToolId, action: execution.actionKey, capabilityKey: execution.capabilityKey })
  if (decision === 'DENY') throw new ToolExecutionError('DENIED')
  return executeStored(execution.id)
}

export async function getToolExecution(projectId: string, executionId: string) { const execution = await prisma.toolExecution.findFirst({ where: { id: executionId, projectId } }); if (!execution) throw new ToolExecutionError('EXECUTION_NOT_FOUND'); return execution }
