import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { PrismaClient, ProjectRole } from '@prisma/client'

import { isProjectNavigationPath, PROJECT_SEARCH_LIMIT, ProjectSearchError, searchProjectRecords } from '../src/lib/project-search'

const prisma = new PrismaClient()
const suffix = randomUUID().replaceAll('-', '')

function context(user: { id: string; email: string }, organization: { id: string; name: string; slug: string }, project: { id: string; name: string; slug: string }, role: ProjectRole) {
  return { user, organization: { ...organization, role: 'ADMIN' as const }, project: { ...project, role } }
}

test('M22 searches only bounded, redacted metadata from the authorized project', async t => {
  const organization = await prisma.organization.create({ data: { name: 'M22 Test', slug: `m22-${suffix}` } })
  const owner = await prisma.user.create({ data: { email: `m22-owner-${suffix}@example.invalid` } })
  const member = await prisma.organizationMember.create({ data: { organizationId: organization.id, userId: owner.id, role: 'ADMIN' } })
  const [alpha, beta, hidden] = await Promise.all(['alpha', 'beta', 'hidden'].map(slug => prisma.project.create({ data: { organizationId: organization.id, name: `${slug}-${suffix}`, slug: `${slug}-${suffix}` } })))
  await Promise.all([prisma.projectMember.create({ data: { organizationId: organization.id, organizationMemberId: member.id, projectId: alpha.id, role: 'VIEWER' } }), prisma.projectMember.create({ data: { organizationId: organization.id, organizationMemberId: member.id, projectId: beta.id, role: 'OWNER' } })])
  const employee = await prisma.employee.create({ data: { name: 'Searchable Employee', role: 'Researcher' } })
  await prisma.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: alpha.id } })
  await prisma.task.create({ data: { projectId: alpha.id, createdById: owner.id, title: 'Searchable task', description: 'private task description' } })
  await prisma.task.create({ data: { projectId: beta.id, createdById: owner.id, title: 'Searchable beta task' } })
  await prisma.knowledgeItem.create({ data: { projectId: alpha.id, title: 'Searchable knowledge', content: 'private brain content' } })
  await prisma.decision.create({ data: { projectId: alpha.id, title: 'Searchable decision', decision: 'private decision text' } })
  await prisma.projectMemory.create({ data: { projectId: alpha.id, title: 'Searchable memory', content: 'private memory text' } })
  await prisma.projectConstitution.create({ data: { projectId: alpha.id, title: 'Searchable constitution', content: 'private constitution text' } })
  for (let index = 0; index < PROJECT_SEARCH_LIMIT + 4; index += 1) await prisma.task.create({ data: { projectId: alpha.id, createdById: owner.id, title: `Bound result ${index}` } })
  t.after(async () => { await prisma.organization.delete({ where: { id: organization.id } }); await prisma.employee.delete({ where: { id: employee.id } }); await prisma.user.delete({ where: { id: owner.id } }); await prisma.$disconnect() })

  const alphaContext = context(owner as { id: string; email: string }, organization, alpha, 'VIEWER')
  const records = await searchProjectRecords(alphaContext, 'Searchable')
  assert.deepEqual(records.results.map(row => row.kind).sort(), ['CONSTITUTION', 'DECISION', 'EMPLOYEE_ASSIGNMENT', 'KNOWLEDGE', 'MEMORY', 'TASK'])
  assert.equal(records.results.every(row => row.href === 'tasks' || row.href === 'workforce' || row.href === 'brain'), true)
  assert.equal(JSON.stringify(records).match(/private task|private brain|private decision|private memory|private constitution|beta/i), null)
  assert.equal((await searchProjectRecords(alphaContext, 'private')).results.length, 0)
  assert.equal((await searchProjectRecords(alphaContext, 'Bound')).results.length, PROJECT_SEARCH_LIMIT)
  await assert.rejects(searchProjectRecords(context(owner as { id: string; email: string }, organization, hidden, 'OWNER'), 'Searchable'), error => error instanceof ProjectSearchError && error.code === 'NOT_FOUND')
})

test('M22 command boundary only allows existing navigation destinations', () => {
  assert.deepEqual(['tasks', 'workforce', 'brain'].map(isProjectNavigationPath), [true, true, true])
  assert.equal(isProjectNavigationPath('approvals'), false)
  assert.equal(isProjectNavigationPath('/api/runtime/executions'), false)
  assert.equal(isProjectNavigationPath('dispatch'), false)
})
