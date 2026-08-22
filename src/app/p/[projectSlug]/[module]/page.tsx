/* eslint-disable react-hooks/error-boundaries */
import { notFound } from 'next/navigation'
import { BarChart3, Blocks, Settings2, Sparkles } from 'lucide-react'

import { EmptyState, PageHeader, StatusPill } from '@/components/rogeros-ui'
import { SkillLibraryWorkspace } from '@/components/skill-library-workspace'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'

const modules = {
  market: { title: 'Market', eyebrow: 'Company capabilities', description: 'A curated home for employees, skills and apps.', icon: Sparkles, cards: [['Employees','Specialist AI employees will become available here.'],['Skills','Approved capabilities for your workforce will live here.'],['Apps','Business tools and connections will be discoverable here.']] },
  reports: { title: 'Reports', eyebrow: 'Business intelligence', description: 'Recurring, decision-ready project reporting.', icon: BarChart3, cards: [['Weekly brief','Business Reporter will publish recurring project briefs here.'],['Performance','Validated operating metrics will appear when their sources are connected.']] },
  automations: { title: 'Automations', eyebrow: 'Recurring work', description: 'AI employee routines and governed business workflows.', icon: Blocks, cards: [['Employee routines','Recurring runtime schedules are not enabled yet.'],['Business workflows','Governed cross-tool workflows will be configured in a future milestone.']] },
  settings: { title: 'Project settings', eyebrow: 'Workspace control', description: 'Project administration remains intentionally limited in this Preview.', icon: Settings2, cards: [['Membership','Project access continues to use RogerOS tenancy and roles.'],['Security','Authorization remains enforced on the server for every action.']] },
} as const

export default async function ModulePage({ params }: { params: Promise<{ projectSlug: string; module: string }> }) {
  try {
    const values = await params; const context = await requireProjectContextBySlug(values.projectSlug); const item = modules[values.module as keyof typeof modules]; if (!item) notFound(); if(values.module==='market') return <SkillLibraryWorkspace project={context.project}/>; const Icon = item.icon
    return <div className="hq-rise"><PageHeader eyebrow={`${context.project.name} · ${item.eyebrow}`} title={item.title} description={item.description} action={<StatusPill tone="accent">Foundation</StatusPill>} /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{item.cards.map(card => <section className="panel" key={card[0]}><EmptyState icon={<Icon />} title={card[0]} description={card[1]} /></section>)}</div></div>
  } catch (error) { if (error instanceof ProjectContextError) notFound(); throw error }
}
