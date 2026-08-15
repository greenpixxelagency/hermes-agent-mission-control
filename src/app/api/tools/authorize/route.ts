import { NextResponse } from 'next/server'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'
import { resolveToolAuthorization } from '@/lib/tool-permissions'

export async function POST(request: Request) { try { const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body); const assignmentId = typeof body.employeeProjectAssignmentId === 'string' ? body.employeeProjectAssignmentId : ''; const projectToolId = typeof body.projectToolId === 'string' ? body.projectToolId : ''; const action = typeof body.action === 'string' ? body.action : ''; return NextResponse.json({ decision: await resolveToolAuthorization({ projectId: context.project.id, assignmentId, projectToolId, action }) }) } catch (error) { return projectScopeErrorResponse(error) } }
