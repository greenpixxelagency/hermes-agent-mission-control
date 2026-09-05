import { notFound } from 'next/navigation'

import { HermesConnectionSettings } from '@/components/hermes-connection-settings'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'

export default async function SettingsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  let project: Awaited<ReturnType<typeof requireProjectContextBySlug>>['project']
  try {
    const { projectSlug } = await params
    const context = await requireProjectContextBySlug(projectSlug)
    project = context.project
  } catch (error) {
    if (error instanceof ProjectContextError) notFound()
    throw error
  }
  return <HermesConnectionSettings project={project} />
}
