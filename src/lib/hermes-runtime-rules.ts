import type { ProjectRole } from '@prisma/client'

const dispatchRoles = new Set<ProjectRole>(['OWNER', 'ADMIN', 'OPERATOR'])
const runtimeAdminRoles = new Set<ProjectRole>(['OWNER', 'ADMIN'])

export function canDispatchToHermes(role: ProjectRole) {
  return dispatchRoles.has(role)
}

export function canManageRuntimeAssignments(role: ProjectRole) {
  return runtimeAdminRoles.has(role)
}
