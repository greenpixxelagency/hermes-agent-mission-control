import { NextResponse } from 'next/server'
import { reconcileHermesBotAssignment } from '@/lib/hermes-bots'
import { botErrorResponse } from '@/lib/hermes-bot-api'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request) { try { const body=await request.json() as Record<string,unknown>;const context=await requireProjectContextForBody(body);const assignmentId=typeof body.employeeProjectAssignmentId==='string'?body.employeeProjectAssignmentId:'';return NextResponse.json({assignment:await reconcileHermesBotAssignment(context,assignmentId)}) } catch(error){try{return projectScopeErrorResponse(error)}catch(scopeError){return botErrorResponse(scopeError)}} }
