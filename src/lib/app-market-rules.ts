import { ProjectRole } from '@prisma/client'

const managingRoles = new Set<ProjectRole>(['OWNER', 'ADMIN'])

export function canManageAppMarket(role: ProjectRole | string) {
  return managingRoles.has(role as ProjectRole)
}

export function canSetAppInstallationStatus(status: string) {
  return new Set<string>(['CONNECTING', 'CONNECTED', 'NEEDS_ATTENTION', 'DISABLED', 'UNINSTALLED']).has(status)
}

export type AppInstallationAction = 'enable' | 'disable' | 'uninstall'

export function isAppInstallationAction(action: unknown): action is AppInstallationAction {
  return action === 'enable' || action === 'disable' || action === 'uninstall'
}

export function canTransitionAppInstallation(status: string, action: AppInstallationAction, connectionReady = false) {
  if (status === 'UNINSTALLED') return false
  if (action === 'uninstall' || action === 'disable') return true
  return connectionReady && ['INSTALLED', 'DISABLED', 'NEEDS_ATTENTION', 'CONNECTED'].includes(status)
}
