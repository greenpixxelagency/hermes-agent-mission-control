import assert from 'node:assert/strict'
import test from 'node:test'

import { OrganizationRole, PrismaClient, ProjectRole } from '@prisma/client'

import { EmployeeMarketError, canManageHiring, changeEmployeeEmployment, createCustomEmployee, hireEmployeeFromMarket, listEmployeeMarketTemplates } from '../src/lib/employee-market'

const prisma = new PrismaClient()
const suffix = `m17-${Date.now()}`

function hasCode(error: unknown, code: string) {
  return error instanceof EmployeeMarketError && error.code === code
}

test('M17 makes market hiring project-owned, role-gated, idempotent, and default-deny', async t => {
  const organization = await prisma.organization.create({ data: { name: 'M17 Test', slug: suffix } })
  const roles: ProjectRole[] = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER']
  const users = await Promise.all(roles.map(role => prisma.user.create({ data: { email: `${suffix}-${role.toLowerCase()}@example.invalid` } })))
  const members = await Promise.all(users.map((user, index) => prisma.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: index < 2 ? OrganizationRole.ADMIN : OrganizationRole.VIEWER } })))
  const [alpha, beta] = await Promise.all(['alpha', 'beta'].map(slug => prisma.project.create({ data: { organizationId: organization.id, name: `${slug}-${suffix}`, slug: `${slug}-${suffix}` } })))
  await Promise.all(members.map((member, index) => prisma.projectMember.create({ data: { projectId: alpha.id, organizationId: organization.id, organizationMemberId: member.id, role: roles[index] } })))
  await prisma.projectMember.create({ data: { projectId: beta.id, organizationId: organization.id, organizationMemberId: members[0].id, role: 'OWNER' } })
  const template = await prisma.employeeMarketTemplate.create({ data: { key: `operations-${suffix}`, versions: { create: { version: 1, name: 'Operations Lead', role: 'Operations Lead', description: 'Coordinates approved work.', soulSummary: 'Escalate consequential decisions.', supportedSkillKeys: ['weekly-review-planning'], recommendedToolKeys: ['google-drive'], kpiTemplates: ['Follow-through'] } } }, include: { versions: true } })
  const contexts = roles.map((role, index) => ({ user: { id: users[index].id, email: users[index].email! }, organization: { id: organization.id, name: organization.name, slug: organization.slug, role: 'ADMIN' as const }, project: { id: alpha.id, name: alpha.name, slug: alpha.slug, role } }))
  const betaOwner = { ...contexts[0], project: { id: beta.id, name: beta.name, slug: beta.slug, role: 'OWNER' as const } }

  t.after(async () => {
    await prisma.organization.delete({ where: { id: organization.id } })
    await prisma.employeeMarketTemplate.delete({ where: { id: template.id } })
    await prisma.user.deleteMany({ where: { id: { in: users.map(user => user.id) } } })
    await prisma.$disconnect()
  })

  assert.deepEqual(roles.map(canManageHiring), [true, true, false, false])
  assert.equal((await listEmployeeMarketTemplates(contexts[0])).some(item => item.key === template.key), true)
  await assert.rejects(listEmployeeMarketTemplates(contexts[3]), error => hasCode(error, 'FORBIDDEN'))
  await assert.rejects(createCustomEmployee(contexts[2], { name: 'Denied', role: 'Denied' }), error => hasCode(error, 'FORBIDDEN'))
  await assert.rejects(hireEmployeeFromMarket(contexts[2], { templateKey: template.key, version: 1 }), error => hasCode(error, 'FORBIDDEN'))
  await assert.rejects(hireEmployeeFromMarket(contexts[0], { templateKey: template.key, version: 1, selectedSkillKeys: ['not-recommended'] }), error => hasCode(error, 'INVALID_SELECTION'))

  const hired = await hireEmployeeFromMarket(contexts[0], { templateKey: template.key, version: 1, selectedSkillKeys: ['weekly-review-planning'], selectedToolKeys: ['google-drive'] })
  assert.equal(hired.created, true)
  assert.equal(hired.hire.templateVersionId, template.versions[0].id)
  const snapshot = hired.hire.configurationSnapshot as { selectedSkillKeys: string[]; selectedToolKeys: string[]; capabilityGrants: string }
  assert.deepEqual(snapshot.selectedSkillKeys, ['weekly-review-planning'])
  assert.deepEqual(snapshot.selectedToolKeys, ['google-drive'])
  assert.equal(snapshot.capabilityGrants, 'NONE')
  assert.equal(await prisma.employeeSkillAssignment.count({ where: { projectId: alpha.id, employeeProjectAssignmentId: hired.hire.employeeProjectAssignmentId } }), 0)
  assert.equal(await prisma.employeeToolPermission.count({ where: { projectId: alpha.id, employeeProjectAssignmentId: hired.hire.employeeProjectAssignmentId } }), 0)
  assert.equal(await prisma.hermesRuntimeAssignment.count({ where: { projectId: alpha.id, employeeProjectAssignmentId: hired.hire.employeeProjectAssignmentId } }), 0)
  const repeat = await hireEmployeeFromMarket(contexts[1], { templateKey: template.key, version: 1 })
  assert.equal(repeat.created, false)
  assert.equal(repeat.hire.employeeProjectAssignmentId, hired.hire.employeeProjectAssignmentId)

  await assert.rejects(changeEmployeeEmployment(betaOwner, hired.hire.employeeProjectAssignmentId, 'pause'), error => hasCode(error, 'EMPLOYEE_ASSIGNMENT_NOT_FOUND'))
  await changeEmployeeEmployment(contexts[1], hired.hire.employeeProjectAssignmentId, 'pause')
  assert.equal((await prisma.employeeProjectAssignment.findUniqueOrThrow({ where: { id: hired.hire.employeeProjectAssignmentId } })).status, 'PAUSED')
  await changeEmployeeEmployment(contexts[0], hired.hire.employeeProjectAssignmentId, 'resume')
  await changeEmployeeEmployment(contexts[0], hired.hire.employeeProjectAssignmentId, 'retire')
  assert.equal((await prisma.employeeProjectAssignment.findUniqueOrThrow({ where: { id: hired.hire.employeeProjectAssignmentId } })).status, 'ARCHIVED')
  assert.equal(await prisma.employeeMarketHire.count({ where: { projectId: alpha.id, employeeProjectAssignmentId: hired.hire.employeeProjectAssignmentId } }), 1)
  const activities = await prisma.employeeEmploymentActivity.findMany({ where: { projectId: alpha.id, employeeProjectAssignmentId: hired.hire.employeeProjectAssignmentId } })
  assert.equal(activities.some(activity => activity.eventType === 'employee.market.hired'), true)
  assert.equal(activities.some(activity => activity.eventType === 'employee.employment.retired'), true)
  const audits = await prisma.auditEvent.findMany({ where: { projectId: alpha.id } })
  assert.equal(audits.some(event => event.eventType === 'employee.market.hired'), true)
  assert.equal(audits.some(event => event.eventType === 'employee.employment.retired'), true)
  assert.equal(/token|secret|password|authorization/i.test(JSON.stringify(audits)), false)
})
