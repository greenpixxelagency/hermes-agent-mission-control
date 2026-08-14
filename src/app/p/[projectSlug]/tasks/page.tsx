/* eslint-disable react-hooks/error-boundaries */
import { notFound } from 'next/navigation'
import { TaskWorkspace } from '@/components/task-workspace'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'
export default async function TasksPage({ params }: { params: Promise<{ projectSlug: string }> }) { try { const { projectSlug } = await params; const context = await requireProjectContextBySlug(projectSlug); const member = await prisma.projectMember.findFirstOrThrow({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } }); return <TaskWorkspace project={context.project} currentMemberId={member.id} /> } catch (e) { if (e instanceof ProjectContextError) notFound(); throw e } }
