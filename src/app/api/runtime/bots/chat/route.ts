import { NextResponse } from 'next/server'
import { getHermesBotAssignment, sendHermesBotMessage } from '@/lib/hermes-bots'
import { botErrorResponse } from '@/lib/hermes-bot-api'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForBody, requireProjectContextForRequest } from '@/lib/project-scope'

export async function GET(request:Request){try{const context=await requireProjectContextForRequest(request);const id=new URL(request.url).searchParams.get('employeeProjectAssignmentId')||'';const assignment=await getHermesBotAssignment(context,id);const conversation=await prisma.conversation.findUnique({where:{projectId_slug:{projectId:context.project.id,slug:`runtime-${assignment.id}`}},include:{messages:{orderBy:{createdAt:'asc'},take:50,select:{id:true,body:true,kind:true,createdAt:true,authorUserId:true,authorSystemIdentity:true}}}});return NextResponse.json({messages:conversation?.messages??[]})}catch(error){try{return projectScopeErrorResponse(error)}catch(scopeError){return botErrorResponse(scopeError)}}}
export async function POST(request:Request){try{const body=await request.json() as Record<string,unknown>;const context=await requireProjectContextForBody(body);const id=typeof body.employeeProjectAssignmentId==='string'?body.employeeProjectAssignmentId:'';const message=typeof body.message==='string'?body.message:'';return NextResponse.json(await sendHermesBotMessage(context,id,message),{status:201})}catch(error){try{return projectScopeErrorResponse(error)}catch(scopeError){return botErrorResponse(scopeError)}}}
