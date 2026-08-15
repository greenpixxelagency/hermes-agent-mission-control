import { NextResponse } from 'next/server'
import { executeToolAction, ToolExecutionError } from '@/lib/tool-execution'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'
const driveCapabilities = new Set(['drive_health', 'drive_list', 'drive_metadata', 'drive_read', 'drive_search'])
function boundedText(value: unknown, max = 240) { return typeof value === 'string' && value.length <= max ? value : undefined }
export async function POST(request: Request) { try {
  const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
  const assignmentId = typeof body.employeeProjectAssignmentId === 'string' ? body.employeeProjectAssignmentId : ''
  const projectToolId = typeof body.projectToolId === 'string' ? body.projectToolId : ''
  const capabilityKey = typeof body.capabilityKey === 'string' && (body.capabilityKey === 'reference_read' || body.capabilityKey === 'reference_execute' || driveCapabilities.has(body.capabilityKey)) ? body.capabilityKey : null
  const actionKey = body.actionKey === 'read' || body.actionKey === 'execute' ? body.actionKey : null
  if (!assignmentId || !projectToolId || !capabilityKey || !actionKey || (driveCapabilities.has(capabilityKey) && actionKey !== 'read')) return NextResponse.json({ error: 'INVALID_TOOL_ACTION' }, { status: 400 })
  const driveRequest = driveCapabilities.has(capabilityKey) ? { fileId: boundedText(body.fileId), parentId: boundedText(body.parentId), query: boundedText(body.query, 160) } : {}
  const execution = await executeToolAction({ projectId: context.project.id, employeeProjectAssignmentId: assignmentId, projectToolId, capabilityKey, actionKey, request: driveRequest, summary: capabilityKey === 'reference_read' ? 'Run staging-safe reference read' : capabilityKey === 'reference_execute' ? 'Run approved synthetic reference action' : `Run governed Google Drive ${capabilityKey.replace('drive_', '')}` })
  return NextResponse.json({ execution: { id: execution.id, status: execution.status, resultText: execution.resultText, resultMetadata: execution.resultMetadata, approvalRequestId: execution.approvalRequestId } }, { status: 201 })
} catch (error) { if (error instanceof ToolExecutionError) return NextResponse.json({ error: error.code }, { status: 400 }); return projectScopeErrorResponse(error) } }
