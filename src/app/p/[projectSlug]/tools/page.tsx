import { notFound } from 'next/navigation'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'
import { ToolWorkspace } from '@/components/tool-workspace'

export default async function ToolsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  try { const { projectSlug } = await params; const context = await requireProjectContextBySlug(projectSlug); return <ToolWorkspace project={context.project} canManage={context.project.role === 'OWNER' || context.project.role === 'ADMIN'} /> } catch (error) { if (error instanceof ProjectContextError) notFound(); throw error }
}
