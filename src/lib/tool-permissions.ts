import { PolicyEnforcement } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { ProjectContext } from '@/lib/project-context'
import { canManageToolPermissions, decidePermission } from '@/lib/tool-permission-rules'
export { canManageToolPermissions, decidePermission } from '@/lib/tool-permission-rules'

export const BUILT_IN_TOOLS = [
  ['shopify','Shopify','COMMERCE'], ['meta_ads','Meta Ads','ADVERTISING'], ['google_ads','Google Ads','ADVERTISING'],
  ['gmail','Gmail','COMMUNICATION'], ['google_drive','Google Drive','KNOWLEDGE'], ['browser','Browser','AUTOMATION'],
  ['n8n','n8n','AUTOMATION'], ['hermes_runtime','Hermes Runtime','RUNTIME'],
] as const

export type AuthorizationDecision = 'DENY' | 'ALLOW_READ' | 'ALLOW_DRAFT' | 'REQUIRE_APPROVAL' | 'ALLOW_EXECUTE'

export async function resolveToolAuthorization(input: { projectId: string; assignmentId: string; projectToolId: string; action: string }): Promise<AuthorizationDecision> {
  if (!['read','draft','execute'].includes(input.action)) return 'DENY'
  const permission = await prisma.employeeToolPermission.findFirst({ where: { projectId: input.projectId, employeeProjectAssignmentId: input.assignmentId, projectToolId: input.projectToolId }, select: { level: true } })
  if (!permission) return 'DENY'
  const policies = await prisma.policy.findMany({ where: { projectId: input.projectId, status: 'ACTIVE' }, select: { enforcement: true, rule: true } })
  const matching = policies.filter(policy => {
    const rule = policy.rule
    return !!rule && typeof rule === 'object' && !Array.isArray(rule) && (rule as { action?: unknown }).action === input.action
  })
  return decidePermission(permission.level, input.action, matching.some(policy => policy.enforcement === PolicyEnforcement.BLOCK) ? 'BLOCK' : matching.some(policy => policy.enforcement === PolicyEnforcement.REQUIRE_APPROVAL) ? 'REQUIRE_APPROVAL' : undefined)
}

export async function ensureBuiltInToolCatalog() {
  for (const [key, name, category] of BUILT_IN_TOOLS) await prisma.toolDefinition.upsert({ where: { key }, create: { key, name, category }, update: { name, category, builtIn: true } })
}

export function assertPermissionAdministration(context: ProjectContext) {
  if (!canManageToolPermissions(context.project.role)) throw new Error('FORBIDDEN')
}
