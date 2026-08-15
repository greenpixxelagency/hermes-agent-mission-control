import { ApprovalStatus, ProjectRole } from '@prisma/client'

export function canDecideApproval(role: ProjectRole) { return role === 'OWNER' || role === 'ADMIN' || role === 'APPROVER' }
export function canTransitionApproval(from: ApprovalStatus, to: 'APPROVED' | 'REJECTED' | 'CANCELLED', expired = false) { return !expired && from === 'PENDING' && ['APPROVED','REJECTED','CANCELLED'].includes(to) }
export function isSafeActionContext(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return !Object.keys(value as Record<string, unknown>).some(key => /token|secret|password|authorization|cookie|database[_-]?url|api[_-]?key/i.test(key))
}
