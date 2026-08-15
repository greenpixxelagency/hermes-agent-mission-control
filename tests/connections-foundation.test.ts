import assert from 'node:assert/strict'
import test from 'node:test'
import { ConnectionStatus, PermissionLevel, ProjectToolStatus } from '@prisma/client'
import { decideApprovalRequest } from '../src/lib/approvals'
import { executeApprovedToolAction, executeToolAction, getToolExecution, ToolExecutionError } from '../src/lib/tool-execution'
import { prisma } from '../src/lib/prisma'

test('M12 governs project connections and synthetic tool execution', async t => {
  const suffix = `m12-${Date.now()}`
  const org = await prisma.organization.create({ data: { name: suffix, slug: suffix } })
  const user = await prisma.user.create({ data: { email: `${suffix}@example.invalid` } })
  const orgMember = await prisma.organizationMember.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } })
  const [vhalam, buddhaji] = await Promise.all(['vhalam', 'buddhaji'].map(slug => prisma.project.create({ data: { organizationId: org.id, name: slug, slug: `${slug}-${suffix}` } })))
  const vMember = await prisma.projectMember.create({ data: { projectId: vhalam.id, organizationId: org.id, organizationMemberId: orgMember.id, role: 'OWNER' } })
  await prisma.projectMember.create({ data: { projectId: buddhaji.id, organizationId: org.id, organizationMemberId: orgMember.id, role: 'OWNER' } })
  const employee = await prisma.employee.create({ data: { name: suffix, role: 'Test', type: 'SYSTEM' } })
  const [vAssignment, bAssignment] = await Promise.all([prisma.employeeProjectAssignment.create({ data: { projectId: vhalam.id, employeeId: employee.id } }), prisma.employeeProjectAssignment.create({ data: { projectId: buddhaji.id, employeeId: employee.id } })])
  const tool = await prisma.toolDefinition.upsert({ where: { key: 'reference_connector' }, create: { key: 'reference_connector', name: 'Reference Connector', category: 'REFERENCE' }, update: {} })
  await prisma.toolCapability.upsert({ where: { toolDefinitionId_key: { toolDefinitionId: tool.id, key: 'reference_read' } }, create: { toolDefinitionId: tool.id, key: 'reference_read', name: 'Read' }, update: {} })
  await prisma.toolCapability.upsert({ where: { toolDefinitionId_key: { toolDefinitionId: tool.id, key: 'reference_execute' } }, create: { toolDefinitionId: tool.id, key: 'reference_execute', name: 'Execute' }, update: {} })
  const [vTool, bTool] = await Promise.all([prisma.projectTool.create({ data: { projectId: vhalam.id, toolDefinitionId: tool.id, status: ProjectToolStatus.CONNECTED } }), prisma.projectTool.create({ data: { projectId: buddhaji.id, toolDefinitionId: tool.id, status: ProjectToolStatus.CONNECTED } })])
  await prisma.projectConnection.create({ data: { projectId: vhalam.id, projectToolId: vTool.id, name: 'Vhalam reference', status: ConnectionStatus.CONNECTED } })
  await prisma.employeeToolPermission.createMany({ data: [{ projectId: vhalam.id, employeeProjectAssignmentId: vAssignment.id, projectToolId: vTool.id, capabilityKey: 'reference_read', level: PermissionLevel.READ }, { projectId: vhalam.id, employeeProjectAssignmentId: vAssignment.id, projectToolId: vTool.id, capabilityKey: 'reference_execute', level: PermissionLevel.EXECUTE_WITH_APPROVAL }] })
  t.after(async () => { await prisma.organization.delete({ where: { id: org.id } }); await prisma.$disconnect() })
  const read = await executeToolAction({ projectId: vhalam.id, employeeProjectAssignmentId: vAssignment.id, projectToolId: vTool.id, capabilityKey: 'reference_read', actionKey: 'read', summary: 'Safe read' })
  assert.equal(read.status, 'SUCCEEDED'); assert.equal(read.resultText, 'REFERENCE_READ_OK')
  const pending = await executeToolAction({ projectId: vhalam.id, employeeProjectAssignmentId: vAssignment.id, projectToolId: vTool.id, capabilityKey: 'reference_execute', actionKey: 'execute', summary: 'Synthetic action' })
  assert.equal(pending.status, 'PENDING_APPROVAL'); assert.ok(pending.approvalRequestId); assert.equal(pending.resultText, null)
  await decideApprovalRequest({ projectId: vhalam.id, approvalId: pending.approvalRequestId!, approverProjectMemberId: vMember.id, outcome: 'APPROVED' })
  const approved = await executeApprovedToolAction({ projectId: vhalam.id, executionId: pending.id })
  assert.equal(approved.status, 'SUCCEEDED'); assert.equal(approved.resultText, 'REFERENCE_EXECUTE_APPROVED_OK')
  await assert.rejects(getToolExecution(buddhaji.id, approved.id), (error: unknown) => error instanceof ToolExecutionError && error.code === 'EXECUTION_NOT_FOUND')
  await assert.rejects(executeToolAction({ projectId: buddhaji.id, employeeProjectAssignmentId: bAssignment.id, projectToolId: vTool.id, capabilityKey: 'reference_read', actionKey: 'read', summary: 'Cross project' }), ToolExecutionError)
  await prisma.policy.create({ data: { projectId: vhalam.id, title: 'Block reads', description: 'test', status: 'ACTIVE', enforcement: 'BLOCK', rule: { action: 'read' } } })
  const blocked = await executeToolAction({ projectId: vhalam.id, employeeProjectAssignmentId: vAssignment.id, projectToolId: vTool.id, capabilityKey: 'reference_read', actionKey: 'read', summary: 'Blocked read' })
  assert.equal(blocked.status, 'FAILED'); assert.equal(blocked.errorMessage, 'DENIED')
  assert.equal(await prisma.projectConnection.count({ where: { projectId: buddhaji.id } }), 0)
  assert.equal(await prisma.auditEvent.count({ where: { projectId: vhalam.id, eventType: { in: ['tool.execution.succeeded', 'tool.execution.denied', 'tool.execution.approval_required'] } } }) >= 3, true)
  void bTool
})
