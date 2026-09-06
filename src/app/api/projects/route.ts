import { NextResponse } from 'next/server'
import { ProjectRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { projectScopeErrorResponse, requireProjectContextForBody } from '@/lib/project-scope'

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48)
export async function POST(request: Request) { try {
  const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
  if (context.organization.role !== 'OWNER' && context.organization.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''; const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : ''
  if (!name || !slugify(name)) return NextResponse.json({ error: 'A project name is required' }, { status: 400 })
  const base = slugify(name); let slug = base; for (let i = 2; await prisma.project.findUnique({ where: { organizationId_slug: { organizationId: context.organization.id, slug } }, select: { id: true } }); i++) slug = `${base}-${i}`.slice(0, 60)
  const project = await prisma.project.create({ data: { organizationId: context.organization.id, name, description: description || null, slug, members: { create: { organizationMemberId: (await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: context.organization.id, userId: context.user.id }, select: { id: true } })).id, role: ProjectRole.OWNER } } }, select: { name: true, slug: true } })
  return NextResponse.json({ project }, { status: 201 })
} catch (error) { return projectScopeErrorResponse(error) } }
export async function DELETE(request: Request) { try {
  const body = await request.json() as Record<string, unknown>; const context = await requireProjectContextForBody(body)
  if (context.project.role !== 'OWNER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const projectId = typeof body.deleteProjectId === 'string' ? body.deleteProjectId : ''
  if (projectId !== context.project.id || body.confirmation !== 'DELETE') return NextResponse.json({ error: 'Confirmation required' }, { status: 400 })
  await prisma.project.delete({ where: { id: projectId } }); return NextResponse.json({ deleted: true })
} catch (error) { return projectScopeErrorResponse(error) } }
