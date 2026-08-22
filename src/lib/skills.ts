import { AuditActorType, EmployeeSkillAssignmentState, HermesReconciliationState, ProjectRole } from '@prisma/client'

import { recordAuditEvent } from '@/lib/audit'
import { reconcileHermesBotAssignment } from '@/lib/hermes-bots'
import { hermesRuntimeAdapter, type HermesRuntimeAdapter } from '@/lib/hermes-runtime-adapter'
import type { ProjectContext } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

const administerRoles = new Set<ProjectRole>(['OWNER', 'ADMIN'])
const safeRuntimeSkill = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export class SkillLibraryError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'SkillLibraryError' }
}

async function actor(context: ProjectContext) {
  const member = await prisma.projectMember.findFirst({ where: { projectId: context.project.id, organizationMember: { userId: context.user.id } }, select: { id: true } })
  if (!member) throw new SkillLibraryError('FORBIDDEN')
  return member
}

async function audit(context: ProjectContext, memberId: string, eventType: string, targetId: string, summary: string, metadata: Record<string, unknown>) {
  return recordAuditEvent({ projectId: context.project.id, eventType, actor: { type: AuditActorType.HUMAN, projectMemberId: memberId }, targetType: 'EmployeeSkillAssignment', targetId, summary, metadata })
}

async function employeeAssignment(context: ProjectContext, id: string) {
  const assignment = await prisma.employeeProjectAssignment.findFirst({ where: { id, projectId: context.project.id }, include: { employee: true, runtimeAssignments: true } })
  if (!assignment) throw new SkillLibraryError('EMPLOYEE_ASSIGNMENT_NOT_FOUND')
  if (!assignment.runtimeAssignments.some(runtime => runtime.active && runtime.assignmentState !== 'RETIRED')) throw new SkillLibraryError('RUNTIME_ASSIGNMENT_NOT_FOUND')
  return assignment
}

function observedSkillKeys(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return new Set<string>()
  const skills = (metadata as { skills?: unknown }).skills
  if (!Array.isArray(skills)) return new Set<string>()
  return new Set(skills.flatMap(skill => skill && typeof skill === 'object' && typeof (skill as { key?: unknown }).key === 'string' ? [(skill as { key: string }).key] : []))
}

export async function listAvailableSkills(context: ProjectContext, employeeProjectAssignmentId?: string) {
  const skills = await prisma.skill.findMany({
    where: { trustStatus: 'TRUSTED', isEnabled: true },
    select: { id: true, slug: true, name: true, description: true, category: true, version: true, sourceType: true, sourceIdentifier: true, trustStatus: true, isEnabled: true, updatedAt: true, assignments: { where: { projectId: context.project.id, state: 'ACTIVE' }, select: { id: true, employeeProjectAssignmentId: true } } },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  })
  let installed: Set<string> | null = null
  if (employeeProjectAssignmentId) {
    const employee = await employeeAssignment(context, employeeProjectAssignmentId)
    installed = observedSkillKeys(employee.runtimeAssignments.find(runtime => runtime.active)?.externalRuntimeMetadata)
  }
  return skills.map(({ sourceIdentifier, ...skill }) => ({ ...skill, assignable: installed ? installed.has(sourceIdentifier) : undefined }))
}

export async function getSkill(context: ProjectContext, skillId: string) {
  void context
  const skill = await prisma.skill.findFirst({ where: { id: skillId, trustStatus: 'TRUSTED', isEnabled: true } })
  if (!skill || skill.sourceType !== 'SYSTEM' || !safeRuntimeSkill.test(skill.sourceIdentifier)) throw new SkillLibraryError('SKILL_NOT_AVAILABLE')
  return skill
}

export async function listEmployeeSkills(context: ProjectContext, employeeProjectAssignmentId: string) {
  await employeeAssignment(context, employeeProjectAssignmentId)
  return prisma.employeeSkillAssignment.findMany({ where: { projectId: context.project.id, employeeProjectAssignmentId, state: 'ACTIVE' }, select: { id: true, state: true, desiredVersion: true, lastReconciledAt: true, reconciliationStatus: true, reconciliationError: true, skill: { select: { id: true, slug: true, name: true, description: true, category: true, version: true } } }, orderBy: { skill: { name: 'asc' } } })
}

async function reconcileSkillChange(context: ProjectContext, memberId: string, assignment: { id: string; employeeProjectAssignmentId: string; skillId: string }, action: 'assigned' | 'removed', adapter: HermesRuntimeAdapter) {
  await audit(context, memberId, 'skill.reconcile.requested', assignment.id, 'Employee capability reconciliation requested', { skillId: assignment.skillId, employeeProjectAssignmentId: assignment.employeeProjectAssignmentId, action })
  try {
    const runtime = await reconcileHermesBotAssignment(context, assignment.employeeProjectAssignmentId, adapter)
    await prisma.employeeSkillAssignment.update({ where: { id: assignment.id }, data: { lastReconciledAt: new Date(), reconciliationStatus: HermesReconciliationState.IN_SYNC, reconciliationError: null } })
    await audit(context, memberId, 'skill.reconcile.succeeded', assignment.id, 'Employee capability reconciliation succeeded', { skillId: assignment.skillId, employeeProjectAssignmentId: assignment.employeeProjectAssignmentId, action, runtimeAssignmentId: runtime.id })
    return runtime
  } catch (error) {
    const code = error instanceof Error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : 'RECONCILIATION_FAILED'
    await prisma.employeeSkillAssignment.update({ where: { id: assignment.id }, data: { reconciliationStatus: HermesReconciliationState.FAILED, reconciliationError: code } })
    await audit(context, memberId, 'skill.reconcile.failed', assignment.id, 'Employee capability reconciliation failed', { skillId: assignment.skillId, employeeProjectAssignmentId: assignment.employeeProjectAssignmentId, action, error: code })
    throw error
  }
}

export async function assignSkill(context: ProjectContext, employeeProjectAssignmentId: string, skillId: string, adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  if (!administerRoles.has(context.project.role)) throw new SkillLibraryError('FORBIDDEN')
  const [member, employee, skill] = await Promise.all([actor(context), employeeAssignment(context, employeeProjectAssignmentId), getSkill(context, skillId)])
  if (!observedSkillKeys(employee.runtimeAssignments.find(runtime => runtime.active)?.externalRuntimeMetadata).has(skill.sourceIdentifier)) throw new SkillLibraryError('SKILL_NOT_INSTALLED')
  const existing = await prisma.employeeSkillAssignment.findUnique({ where: { employeeProjectAssignmentId_skillId: { employeeProjectAssignmentId, skillId } } })
  if (existing?.state === EmployeeSkillAssignmentState.ACTIVE) return prisma.employeeSkillAssignment.findUniqueOrThrow({ where: { id: existing.id }, include: { skill: true } })
  const assignment = await prisma.$transaction(async tx => {
    const saved = existing
      ? await tx.employeeSkillAssignment.update({ where: { id: existing.id }, data: { state: 'ACTIVE', assignedByUserId: context.user.id, desiredVersion: skill.version, assignedAt: new Date(), removedAt: null, lastReconciledAt: null, reconciliationStatus: 'DRIFTED', reconciliationError: null } })
      : await tx.employeeSkillAssignment.create({ data: { projectId: context.project.id, employeeProjectAssignmentId: employee.id, skillId: skill.id, assignedByUserId: context.user.id, desiredVersion: skill.version } })
    await tx.hermesRuntimeAssignment.updateMany({ where: { projectId: context.project.id, employeeProjectAssignmentId: employee.id, active: true }, data: { desiredSkillRevision: { increment: 1 }, reconciliationState: 'DRIFTED' } })
    return saved
  })
  await audit(context, member.id, 'skill.assigned', assignment.id, `${skill.name} assigned to ${employee.employee.name}`, { skillId: skill.id, skillSlug: skill.slug, employeeProjectAssignmentId })
  await reconcileSkillChange(context, member.id, assignment, 'assigned', adapter)
  return prisma.employeeSkillAssignment.findUniqueOrThrow({ where: { id: assignment.id }, include: { skill: true } })
}

export async function removeSkill(context: ProjectContext, employeeProjectAssignmentId: string, skillId: string, adapter: HermesRuntimeAdapter = hermesRuntimeAdapter) {
  if (!administerRoles.has(context.project.role)) throw new SkillLibraryError('FORBIDDEN')
  const [member, employee, skill] = await Promise.all([actor(context), employeeAssignment(context, employeeProjectAssignmentId), getSkill(context, skillId)])
  const existing = await prisma.employeeSkillAssignment.findFirst({ where: { projectId: context.project.id, employeeProjectAssignmentId, skillId, state: 'ACTIVE' } })
  if (!existing) throw new SkillLibraryError('SKILL_ASSIGNMENT_NOT_FOUND')
  const assignment = await prisma.$transaction(async tx => {
    const saved = await tx.employeeSkillAssignment.update({ where: { id: existing.id }, data: { state: 'REMOVED', removedAt: new Date(), lastReconciledAt: null, reconciliationStatus: 'DRIFTED', reconciliationError: null } })
    await tx.hermesRuntimeAssignment.updateMany({ where: { projectId: context.project.id, employeeProjectAssignmentId: employee.id, active: true }, data: { desiredSkillRevision: { increment: 1 }, reconciliationState: 'DRIFTED' } })
    return saved
  })
  await audit(context, member.id, 'skill.removed', assignment.id, `${skill.name} removed from ${employee.employee.name}`, { skillId: skill.id, skillSlug: skill.slug, employeeProjectAssignmentId })
  await reconcileSkillChange(context, member.id, assignment, 'removed', adapter)
  return prisma.employeeSkillAssignment.findUniqueOrThrow({ where: { id: assignment.id }, include: { skill: true } })
}
