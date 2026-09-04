import { ProjectRole } from '@prisma/client'

const managingRoles = new Set<ProjectRole>(['OWNER', 'ADMIN'])

export function canManageAppMarket(role: ProjectRole | string) {
  return managingRoles.has(role as ProjectRole)
}

export function canSetAppInstallationStatus(status: string) {
  return new Set<string>(['CONNECTING', 'CONNECTED', 'NEEDS_ATTENTION', 'DISABLED', 'UNINSTALLED']).has(status)
}
