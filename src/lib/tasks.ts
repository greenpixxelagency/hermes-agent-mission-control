import { prisma } from '@/lib/prisma'
import type { ProjectContext } from '@/lib/project-context'

export class TaskAccessError extends Error { constructor() { super('TASK_NOT_FOUND'); this.name = 'TaskAccessError' } }
export async function requireTaskAccess(context: ProjectContext, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, projectId: context.project.id }, include: {
    assignments: { include: { projectMember: { include: { organizationMember: { include: { user: { select: { name: true, email: true } } } } } } } },
    subtasks: true, dependencies: { include: { dependsOnTask: true } }, relatedThread: true,
    activities: { include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
  } })
  if (!task) throw new TaskAccessError()
  return task
}
export function taskErrorResponse(error: unknown) { if (error instanceof TaskAccessError) return Response.json({ error: 'Not found' }, { status: 404 }); throw error }
