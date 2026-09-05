import { Prisma } from '@prisma/client'

import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

export const PROJECT_SEARCH_LIMIT = 24
const PER_KIND_LIMIT = PROJECT_SEARCH_LIMIT

export type ProjectSearchKind = 'TASK' | 'EMPLOYEE_ASSIGNMENT' | 'CONSTITUTION' | 'KNOWLEDGE' | 'DECISION' | 'MEMORY'
export type ProjectSearchResult = {
  id: string
  kind: ProjectSearchKind
  title: string
  detail: string
  href: 'tasks' | 'workforce' | 'brain'
  updatedAt: string
}

export class ProjectSearchError extends Error {
  constructor(public readonly code: 'INVALID_QUERY' | 'NOT_FOUND') {
    super(code)
    this.name = 'ProjectSearchError'
  }
}

export function parseProjectSearchQuery(value: string | null): string {
  const query = value?.trim() ?? ''
  if (query.length > 100) throw new ProjectSearchError('INVALID_QUERY')
  return query
}

export function isProjectNavigationPath(path: string): path is ProjectSearchResult['href'] {
  return path === 'tasks' || path === 'workforce' || path === 'brain'
}

// This is a deliberately small RogerOS-only allowlist. It searches only display
// metadata (never descriptions, Brain content, prompts, execution results, JSON,
// connection data, credentials, or legacy Hermy HQ records).
export async function searchProjectRecords(context: ProjectContext, requestedQuery: string) {
  const query = parseProjectSearchQuery(requestedQuery)
  if (!query) return { query, limit: PROJECT_SEARCH_LIMIT, results: [] as ProjectSearchResult[] }

  return prisma.$transaction(async db => {
    // A constructed or stale context must not become search authority.
    const membership = await db.projectMember.findFirst({
      where: { projectId: context.project.id, organizationMember: { userId: context.user.id } },
      select: { id: true },
    })
    if (!membership) throw new ProjectSearchError('NOT_FOUND')

    const contains = { contains: query, mode: Prisma.QueryMode.insensitive }
    const [tasks, assignments, constitution, knowledge, decisions, memories] = await Promise.all([
      db.task.findMany({ where: { projectId: context.project.id, title: contains }, select: { id: true, title: true, status: true, priority: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: PER_KIND_LIMIT }),
      db.employeeProjectAssignment.findMany({ where: { projectId: context.project.id, OR: [{ roleOverride: contains }, { employee: { name: contains } }, { employee: { role: contains } }] }, select: { id: true, status: true, roleOverride: true, updatedAt: true, employee: { select: { name: true, role: true } } }, orderBy: { updatedAt: 'desc' }, take: PER_KIND_LIMIT }),
      db.projectConstitution.findMany({ where: { projectId: context.project.id, title: contains }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 1 }),
      db.knowledgeItem.findMany({ where: { projectId: context.project.id, title: contains }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: PER_KIND_LIMIT }),
      db.decision.findMany({ where: { projectId: context.project.id, title: contains }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: PER_KIND_LIMIT }),
      db.projectMemory.findMany({ where: { projectId: context.project.id, title: contains }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: PER_KIND_LIMIT }),
    ])

    const results: ProjectSearchResult[] = [
      ...tasks.map(row => ({ id: row.id, kind: 'TASK' as const, title: row.title, detail: `${row.status} task · ${row.priority} priority`, href: 'tasks' as const, updatedAt: row.updatedAt.toISOString() })),
      ...assignments.map(row => ({ id: row.id, kind: 'EMPLOYEE_ASSIGNMENT' as const, title: row.employee.name, detail: `${row.roleOverride ?? row.employee.role} · ${row.status}`, href: 'workforce' as const, updatedAt: row.updatedAt.toISOString() })),
      ...constitution.map(row => ({ id: row.id, kind: 'CONSTITUTION' as const, title: row.title, detail: `${row.status} constitution`, href: 'brain' as const, updatedAt: row.updatedAt.toISOString() })),
      ...knowledge.map(row => ({ id: row.id, kind: 'KNOWLEDGE' as const, title: row.title, detail: `${row.status} knowledge`, href: 'brain' as const, updatedAt: row.updatedAt.toISOString() })),
      ...decisions.map(row => ({ id: row.id, kind: 'DECISION' as const, title: row.title, detail: `${row.status} decision`, href: 'brain' as const, updatedAt: row.updatedAt.toISOString() })),
      ...memories.map(row => ({ id: row.id, kind: 'MEMORY' as const, title: row.title, detail: `${row.status} memory`, href: 'brain' as const, updatedAt: row.updatedAt.toISOString() })),
    ]

    return { query, limit: PROJECT_SEARCH_LIMIT, results: results.slice(0, PROJECT_SEARCH_LIMIT) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10_000 })
}
