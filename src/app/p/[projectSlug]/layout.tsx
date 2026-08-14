/* eslint-disable react-hooks/error-boundaries */
import { notFound } from 'next/navigation'
import { RogerOSShell } from '@/components/rogeros-shell'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectSlug: string }> }) {
  try { const { projectSlug } = await params; const context = await requireProjectContextBySlug(projectSlug); const projects = await prisma.project.findMany({ where: { members: { some: { organizationMember: { userId: context.user.id } } } }, select: { name: true, slug: true }, orderBy: { name: 'asc' } }); return <RogerOSShell project={context.project} projects={projects}>{children}</RogerOSShell> } catch (error) { if (error instanceof ProjectContextError) notFound(); throw error }
}
