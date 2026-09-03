import { AuditActorType, EmployeeStatus, Prisma, ProjectRole } from '@prisma/client'

import { recordAuditEvent, safeMetadata } from '@/lib/audit'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

const hiringRoles = new Set<ProjectRole>(['OWNER', 'ADMIN'])
const safeCatalogKey = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class EmployeeMarketError extends Error {
  constructor(public readonly code: string) { super(code) }
}

export function canManageHiring(role: ProjectRole | string) {
  return hiringRoles.has(role as ProjectRole)
}

async function actor(context: ProjectContext) {
  if (!canManageHiring(context.project.role)) throw new EmployeeMarketError('FORBIDDEN')
  const member = await prisma.projectMember.findFirst({
    where: { projectId: context.project.id, organizationMember: { userId: context.user.id } },
    select: { id: true },
  })
  if (!member) throw new EmployeeMarketError('FORBIDDEN')
  return member
}

function safeSelections(value: unknown, supported: string[]) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 20 || value.some(item => typeof item !== 'string' || !safeCatalogKey.test(item))) throw new EmployeeMarketError('INVALID_SELECTION')
  const selected = [...new Set(value)] as string[]
  if (selected.some(item => !supported.includes(item))) throw new EmployeeMarketError('INVALID_SELECTION')
  return selected.sort()
}

export async function listEmployeeMarketTemplates(context: ProjectContext) {
  await actor(context)
  const versions = await prisma.employeeMarketTemplateVersion.findMany({
    where: { isEnabled: true },
    include: { template: { select: { key: true } } },
    orderBy: [{ template: { key: 'asc' } }, { version: 'desc' }],
  })
  const newestByKey = new Set<string>()
  return versions.flatMap(version => {
    if (newestByKey.has(version.template.key)) return []
    newestByKey.add(version.template.key)
    return [{
      key: version.template.key, version: version.version, name: version.name, role: version.role,
      description: version.description, soulSummary: version.soulSummary, supportedSkillKeys: version.supportedSkillKeys,
      recommendedToolKeys: version.recommendedToolKeys, kpiTemplates: version.kpiTemplates,
    }]
  })
}

export async function createCustomEmployee(context: ProjectContext, input: { name?: unknown; role?: unknown; description?: unknown; soulSummary?: unknown }) {
  const member = await actor(context)
  const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : ''
  const role = typeof input.role === 'string' ? input.role.trim().slice(0, 120) : ''
  if (!name || !role) throw new EmployeeMarketError('INVALID_CUSTOM_EMPLOYEE')
  const description = typeof input.description === 'string' ? input.description.slice(0, 5000) : null
  const soulSummary = typeof input.soulSummary === 'string' ? input.soulSummary.slice(0, 5000) : null
  const result = await prisma.$transaction(async tx => {
    const employee = await tx.employee.create({ data: { name, role, type: 'CUSTOM', description, soulSummary } })
    const assignment = await tx.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: context.project.id } })
    await tx.employeeEmploymentActivity.create({ data: { projectId: context.project.id, employeeProjectAssignmentId: assignment.id, actorProjectMemberId: member.id, eventType: 'employee.custom.hired', detail: `${name} added as a custom employee`, metadata: { role } } })
    return { employee, assignment }
  })
  await recordAuditEvent({ projectId: context.project.id, eventType: 'employee.custom.hired', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'EmployeeProjectAssignment', targetId: result.assignment.id, summary: `${name} added as a custom employee`, metadata: { role } })
  return result
}

export async function hireEmployeeFromMarket(context: ProjectContext, input: { templateKey?: unknown; version?: unknown; selectedSkillKeys?: unknown; selectedToolKeys?: unknown }) {
  const member = await actor(context)
  const templateKey = typeof input.templateKey === 'string' && safeCatalogKey.test(input.templateKey) ? input.templateKey : ''
  const version = typeof input.version === 'number' && Number.isInteger(input.version) && input.version > 0 ? input.version : 0
  if (!templateKey || !version) throw new EmployeeMarketError('INVALID_TEMPLATE')
  const templateVersion = await prisma.employeeMarketTemplateVersion.findFirst({
    where: { version, isEnabled: true, template: { key: templateKey } }, include: { template: { select: { key: true } } },
  })
  if (!templateVersion) throw new EmployeeMarketError('TEMPLATE_NOT_FOUND')
  const selectedSkillKeys = safeSelections(input.selectedSkillKeys, templateVersion.supportedSkillKeys)
  const selectedToolKeys = safeSelections(input.selectedToolKeys, templateVersion.recommendedToolKeys)
  const snapshot = safeMetadata({
    templateKey, templateVersion: templateVersion.version, name: templateVersion.name, role: templateVersion.role,
    description: templateVersion.description, soulSummary: templateVersion.soulSummary,
    supportedSkillKeys: templateVersion.supportedSkillKeys, recommendedToolKeys: templateVersion.recommendedToolKeys,
    selectedSkillKeys, selectedToolKeys, kpiTemplates: templateVersion.kpiTemplates,
    capabilityGrants: 'NONE',
  }) as Prisma.InputJsonValue
  const result = await prisma.$transaction(async tx => {
    const existing = await tx.employeeMarketHire.findUnique({
      where: { projectId_templateKey: { projectId: context.project.id, templateKey } },
      include: { employeeAssignment: { include: { employee: true } } },
    })
    if (existing) return { hire: existing, created: false }
    const employee = await tx.employee.create({
      data: { name: templateVersion.name, role: templateVersion.role, description: templateVersion.description, soulSummary: templateVersion.soulSummary, type: 'CUSTOM' },
    })
    const assignment = await tx.employeeProjectAssignment.create({ data: { employeeId: employee.id, projectId: context.project.id } })
    const hire = await tx.employeeMarketHire.create({
      data: { projectId: context.project.id, employeeProjectAssignmentId: assignment.id, templateVersionId: templateVersion.id, templateKey, templateVersion: templateVersion.version, configurationSnapshot: snapshot, hiredByProjectMemberId: member.id },
      include: { employeeAssignment: { include: { employee: true } } },
    })
    await tx.employeeEmploymentActivity.create({
      data: { projectId: context.project.id, employeeProjectAssignmentId: assignment.id, actorProjectMemberId: member.id, eventType: 'employee.market.hired', detail: `${templateVersion.name} hired from the employee market`, metadata: snapshot },
    })
    return { hire, created: true }
  })
  if (result.created) await recordAuditEvent({
    projectId: context.project.id, eventType: 'employee.market.hired', actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'EmployeeMarketHire', targetId: result.hire.id,
    summary: `${templateVersion.name} hired from the employee market`, metadata: { templateKey, templateVersion: templateVersion.version, selectedSkillKeys, selectedToolKeys, capabilityGrants: 'NONE' },
  })
  return result
}

export async function changeEmployeeEmployment(context: ProjectContext, employeeProjectAssignmentId: string, action: 'pause' | 'resume' | 'retire') {
  const member = await actor(context)
  const assignment = await prisma.employeeProjectAssignment.findFirst({ where: { id: employeeProjectAssignmentId, projectId: context.project.id }, include: { employee: true } })
  if (!assignment) throw new EmployeeMarketError('EMPLOYEE_ASSIGNMENT_NOT_FOUND')
  if (action === 'resume' && assignment.status !== EmployeeStatus.PAUSED) throw new EmployeeMarketError('EMPLOYMENT_NOT_PAUSED')
  if ((action === 'pause' || action === 'retire') && assignment.status !== EmployeeStatus.ACTIVE) throw new EmployeeMarketError('EMPLOYMENT_NOT_ACTIVE')
  const status = action === 'pause' ? EmployeeStatus.PAUSED : action === 'resume' ? EmployeeStatus.ACTIVE : EmployeeStatus.ARCHIVED
  const eventType = `employee.employment.${action}d`
  const saved = await prisma.$transaction(async tx => {
    const updated = await tx.employeeProjectAssignment.update({ where: { id: assignment.id }, data: { status, pausedAt: action === 'pause' ? new Date() : null } })
    if (action === 'retire') await tx.hermesRuntimeAssignment.updateMany({ where: { projectId: context.project.id, employeeProjectAssignmentId: assignment.id, assignmentState: { not: 'RETIRED' } }, data: { active: false, assignmentState: 'RETIRED', retiredAt: new Date() } })
    await tx.employeeEmploymentActivity.create({ data: { projectId: context.project.id, employeeProjectAssignmentId: assignment.id, actorProjectMemberId: member.id, eventType, detail: `${assignment.employee.name} employment ${action}d`, metadata: { priorStatus: assignment.status, status } } })
    return updated
  })
  await recordAuditEvent({ projectId: context.project.id, eventType, actor: { type: AuditActorType.HUMAN, projectMemberId: member.id }, targetType: 'EmployeeProjectAssignment', targetId: assignment.id, summary: `${assignment.employee.name} employment ${action}d`, metadata: { priorStatus: assignment.status, status } })
  return saved
}
