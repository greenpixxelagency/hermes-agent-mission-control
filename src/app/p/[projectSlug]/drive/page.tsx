/* eslint-disable react-hooks/error-boundaries */
import { notFound } from 'next/navigation'

import { DriveWorkspace } from '@/components/drive-workspace'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'

export default async function DrivePage({ params }: { params: Promise<{ projectSlug: string }> }) {
  try { const { projectSlug } = await params; return <DriveWorkspace project={(await requireProjectContextBySlug(projectSlug)).project} /> }
  catch (error) { if (error instanceof ProjectContextError) notFound(); throw error }
}
