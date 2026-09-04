import { PrismaClient } from '@prisma/client'

import { ensureBuiltInToolCatalog } from '../src/lib/tool-permissions'

const prisma = new PrismaClient()

const skills = [
  ['skill_grounded_citations', 'grounded-citations', 'Grounded Research', 'Ground answers and working documents in cited, verifiable sources.', 'Research', 'grounded-citations'],
  ['skill_document_actions', 'document-to-action-items', 'Document Action Planning', 'Extract clear obligations, deadlines, and next actions from business documents.', 'Operations', 'document-to-action-items'],
  ['skill_weekly_review', 'weekly-review-planning', 'Weekly Review Planning', 'Turn commitments and stalled work into a focused weekly operating plan.', 'Operations', 'weekly-review-planning'],
  ['skill_humanizer', 'humanizer', 'Natural Business Writing', 'Refine business writing into clear, natural language without generic AI phrasing.', 'Writing', 'humanizer'],
  ['skill_competitor_news', 'competitor-news-monitor', 'Competitor Intelligence', 'Monitor named companies for material news and produce concise, cited updates.', 'Analysis', 'competitor-news-monitor'],
  ['skill_one_three_one_rule', 'one-three-one-rule', '1-3-1 Communication', 'Structure concise updates as one issue, three options, and one recommendation.', 'Communication', 'one-three-one-rule'],
] as const

const manifestCapabilities = [
  ['drive_health', 'Connection health', 'Read-only connection health check.'],
  ['drive_list', 'List scoped files', 'List files only within explicit project scopes.'],
  ['drive_metadata', 'Read scoped metadata', 'Read metadata for an explicitly allowed Drive object.'],
  ['drive_read', 'Read scoped file', 'Read bounded content from an explicitly allowed supported file.'],
  ['drive_search', 'Search scoped Drive', 'Search only within an explicitly selected folder scope.'],
] as const

async function seedCatalog() {
  await ensureBuiltInToolCatalog()

  for (const [id, slug, name, description, category, sourceIdentifier] of skills) {
    await prisma.skill.upsert({
      where: { sourceIdentifier },
      create: { id, slug, name, description, category, sourceIdentifier, sourceType: 'SYSTEM', trustStatus: 'TRUSTED', isEnabled: true },
      update: { slug, name, description, category, sourceType: 'SYSTEM', trustStatus: 'TRUSTED', isEnabled: true },
    })
  }

  const tool = await prisma.toolDefinition.upsert({
    where: { key: 'google_drive' },
    create: { id: 'market_tool_google_drive', key: 'google_drive', name: 'Google Drive', description: 'Scoped Google Drive knowledge connection.', category: 'KNOWLEDGE', builtIn: true },
    update: { name: 'Google Drive', description: 'Scoped Google Drive knowledge connection.', category: 'KNOWLEDGE', builtIn: true },
  })
  for (const [key, name, description] of manifestCapabilities) {
    await prisma.toolCapability.upsert({ where: { toolDefinitionId_key: { toolDefinitionId: tool.id, key } }, create: { toolDefinitionId: tool.id, key, name, description }, update: { name, description } })
  }

  const manifest = await prisma.appMarketManifest.upsert({ where: { key: 'google-drive' }, create: { id: 'market_manifest_google_drive', key: 'google-drive' }, update: {} })
  await prisma.appMarketManifestVersion.upsert({
    where: { manifestId_version: { manifestId: manifest.id, version: 1 } },
    create: { id: 'market_manifest_google_drive_v1', manifestId: manifest.id, version: 1, name: 'Google Drive', description: 'Connect a project-selected Google Drive account through the existing scoped connection flow.', category: 'KNOWLEDGE', kind: 'APP', toolDefinitionId: tool.id, capabilityKeys: manifestCapabilities.map(([key]) => key), connectionType: 'GOOGLE_DRIVE', isEnabled: true },
    update: { name: 'Google Drive', description: 'Connect a project-selected Google Drive account through the existing scoped connection flow.', category: 'KNOWLEDGE', kind: 'APP', toolDefinitionId: tool.id, capabilityKeys: manifestCapabilities.map(([key]) => key), connectionType: 'GOOGLE_DRIVE', isEnabled: true },
  })

  const templates = [
    { id: 'market_template_operations_coordinator', key: 'operations-coordinator', versionId: 'market_template_operations_coordinator_v1', name: 'Operations Coordinator', role: 'Operations Coordinator', description: 'Coordinates approved project work, clarifies owners, and maintains reliable follow-through.', soulSummary: 'Keep work organized, surface blockers, and escalate consequential decisions.', supportedSkillKeys: ['weekly-review-planning', 'document-to-action-items'], kpiTemplates: ['Clear next actions', 'On-time follow-through'] },
    { id: 'market_template_research_analyst', key: 'research-analyst', versionId: 'market_template_research_analyst_v1', name: 'Research Analyst', role: 'Research Analyst', description: 'Produces grounded research briefs and concise decision support for approved project questions.', soulSummary: 'Use verifiable sources, distinguish evidence from inference, and escalate uncertainty.', supportedSkillKeys: ['grounded-citations', 'competitor-news-monitor'], kpiTemplates: ['Evidence quality', 'Decision-ready brief'] },
  ] as const
  for (const template of templates) {
    const saved = await prisma.employeeMarketTemplate.upsert({ where: { key: template.key }, create: { id: template.id, key: template.key }, update: {} })
    await prisma.employeeMarketTemplateVersion.upsert({
      where: { templateId_version: { templateId: saved.id, version: 1 } },
      create: { id: template.versionId, templateId: saved.id, version: 1, name: template.name, role: template.role, description: template.description, soulSummary: template.soulSummary, supportedSkillKeys: [...template.supportedSkillKeys], recommendedToolKeys: ['google-drive'], kpiTemplates: template.kpiTemplates, isEnabled: true },
      update: { name: template.name, role: template.role, description: template.description, soulSummary: template.soulSummary, supportedSkillKeys: [...template.supportedSkillKeys], recommendedToolKeys: ['google-drive'], kpiTemplates: template.kpiTemplates, isEnabled: true },
    })
  }
}

async function seedLocalOwner() {
  const email = process.env.LOCAL_OWNER_EMAIL?.trim().toLowerCase()
  if (!email) return
  const user = await prisma.user.upsert({ where: { email }, create: { email, name: process.env.LOCAL_OWNER_NAME?.trim() || 'Local Owner' }, update: { name: process.env.LOCAL_OWNER_NAME?.trim() || 'Local Owner' } })
  const organization = await prisma.organization.upsert({ where: { slug: 'local-development' }, create: { name: 'Local Development', slug: 'local-development' }, update: { name: 'Local Development' } })
  const organizationMember = await prisma.organizationMember.upsert({ where: { userId_organizationId: { userId: user.id, organizationId: organization.id } }, create: { userId: user.id, organizationId: organization.id, role: 'OWNER' }, update: { role: 'OWNER' } })
  const project = await prisma.project.upsert({ where: { organizationId_slug: { organizationId: organization.id, slug: 'local' } }, create: { organizationId: organization.id, name: 'Local Workspace', slug: 'local' }, update: { name: 'Local Workspace', status: 'ACTIVE' } })
  await prisma.projectMember.upsert({ where: { projectId_organizationMemberId: { projectId: project.id, organizationMemberId: organizationMember.id } }, create: { projectId: project.id, organizationId: organization.id, organizationMemberId: organizationMember.id, role: 'OWNER' }, update: { role: 'OWNER' } })
}

async function main() {
  await seedCatalog()
  await seedLocalOwner()
  console.log('Local RogerOS catalog synchronized.')
}

main().finally(() => prisma.$disconnect())
