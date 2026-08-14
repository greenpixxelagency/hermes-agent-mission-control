import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { OrganizationRole, ProjectRole } from '@prisma/client'

export type ProjectContext = {
  user: { id: string; email: string }
  organization: { id: string; name: string; slug: string; role: OrganizationRole }
  project: { id: string; name: string; slug: string; role: ProjectRole }
}

export class ProjectContextError extends Error {
  constructor(
    public readonly code: 'UNAUTHENTICATED' | 'PROJECT_NOT_FOUND',
    public readonly status: 401 | 404,
  ) {
    super(code)
    this.name = 'ProjectContextError'
  }
}

type MembershipRecord = {
  project: { id: string; name: string; slug: string }
  role: ProjectRole
  organizationMember: {
    role: OrganizationRole
    organization: { id: string; name: string; slug: string }
  }
}

export function requireAuthenticatedUserId(userId: string | null | undefined): string {
  if (!userId) throw new ProjectContextError('UNAUTHENTICATED', 401)
  return userId
}

export function toProjectContext(
  user: { id: string; email: string },
  membership: MembershipRecord | null,
): ProjectContext {
  if (!membership) {
    // Deliberately do not distinguish a missing project from a project the caller cannot access.
    throw new ProjectContextError('PROJECT_NOT_FOUND', 404)
  }

  return {
    user,
    organization: {
      ...membership.organizationMember.organization,
      role: membership.organizationMember.role,
    },
    project: {
      ...membership.project,
      role: membership.role,
    },
  }
}

export async function requirePersistentUser() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user
  const email = sessionUser?.email?.trim().toLowerCase()
  if (!email || !sessionUser) throw new ProjectContextError('UNAUTHENTICATED', 401)

  return prisma.user.upsert({
    where: { email },
    create: { email, name: sessionUser.name, image: sessionUser.image },
    update: { name: sessionUser.name, image: sessionUser.image },
    select: { id: true, email: true },
  })
}

export async function requireProjectContext(projectId: string): Promise<ProjectContext> {
  const persistentUser = await requirePersistentUser()
  const user = { id: persistentUser.id, email: persistentUser.email! }

  const membership = await prisma.projectMember.findFirst({
    where: {
      projectId,
      organizationMember: { userId: user.id },
    },
    select: {
      role: true,
      project: { select: { id: true, name: true, slug: true } },
      organizationMember: {
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  })

  return toProjectContext(user, membership)
}
