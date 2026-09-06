import { NextResponse } from 'next/server'
import { configureHermesConnection, disconnectHermesConnection, hermesConnectionStatus, HermesConnectionError } from '@/lib/hermes-connection'
import { requireProjectContextForRequest } from '@/lib/project-scope'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : ''
    const connectionSecret = typeof body.connectionSecret === 'string' ? body.connectionSecret.trim() : ''
    const result = await configureHermesConnection(await requireProjectContextForBody(body), { agentId, connectionSecret })
    return NextResponse.json({ connection: result }, { status: 201 })
  } catch (error) {
    if (error instanceof HermesConnectionError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Forbidden' : 'Unable to configure Hermes connection' }, { status: error.code === 'FORBIDDEN' ? 403 : 400 })
    return projectScopeErrorResponse(error)
  }
}

export async function GET(request: Request) {
  try { return NextResponse.json(await hermesConnectionStatus(await requireProjectContextForRequest(request))) }
  catch (error) { return projectScopeErrorResponse(error) }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    return NextResponse.json(await disconnectHermesConnection(await requireProjectContextForBody(body)))
  } catch (error) {
    if (error instanceof HermesConnectionError) return NextResponse.json({ error: error.code === 'FORBIDDEN' ? 'Forbidden' : 'Unable to disconnect Hermes' }, { status: error.code === 'FORBIDDEN' ? 403 : 400 })
    return projectScopeErrorResponse(error)
  }
}
