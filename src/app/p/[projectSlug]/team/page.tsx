/* eslint-disable react-hooks/error-boundaries */
import { notFound } from 'next/navigation'
import { TeamWorkspace } from '@/components/team-workspace'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'

export default async function TeamPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  try { const { projectSlug } = await params; const context = await requireProjectContextBySlug(projectSlug); return <TeamWorkspace project={context.project} /> }
  catch (error) { if (error instanceof ProjectContextError) notFound(); throw error }
}
