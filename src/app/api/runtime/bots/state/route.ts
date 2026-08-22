import { NextResponse } from 'next/server'
import { setHermesBotSuspension } from '@/lib/hermes-bots'
import { botErrorResponse } from '@/lib/hermes-bot-api'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request:Request){try{const body=await request.json() as Record<string,unknown>;const context=await requireProjectContextForBody(body);const id=typeof body.employeeProjectAssignmentId==='string'?body.employeeProjectAssignmentId:'';const action=body.action==='suspend'||body.action==='resume'?body.action:null;if(!action)return NextResponse.json({error:'INVALID_ACTION'},{status:400});const loaded=await setHermesBotSuspension(context,id,action);return NextResponse.json({assignment:loaded.runtimeAssignment})}catch(error){try{return projectScopeErrorResponse(error)}catch(scopeError){return botErrorResponse(scopeError)}}}
