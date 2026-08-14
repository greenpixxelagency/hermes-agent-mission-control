import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ProjectContextError, requirePersistentUser } from '@/lib/project-context'

export async function GET() {
  try {
    const user = await requirePersistentUser()
    const projects = await prisma.project.findMany({ where: { members: { some: { organizationMember: { userId: user.id } } } }, select: { slug: true, name: true }, orderBy: [{ slug: 'asc' }] })
    return NextResponse.json({ projects })
  } catch (error) {
    if (error instanceof ProjectContextError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    throw error
  }
}
