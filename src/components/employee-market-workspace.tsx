'use client'

import { useCallback, useEffect, useState } from 'react'
import { BriefcaseBusiness, CheckCircle2, LockKeyhole, Sparkles } from 'lucide-react'

import { EmptyState, PageHeader, StatusPill } from '@/components/rogeros-ui'

type Template = { key: string; version: number; name: string; role: string; description: string; soulSummary: string | null; supportedSkillKeys: string[]; recommendedToolKeys: string[]; kpiTemplates: unknown }

export function EmployeeMarketWorkspace({ project }: { project: { id: string; name: string; role: string } }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selected, setSelected] = useState<Template | null>(null)
  const [skills, setSkills] = useState<string[]>([])
  const [tools, setTools] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const canHire = project.role === 'OWNER' || project.role === 'ADMIN'
  const load = useCallback(async () => {
    setLoading(true)
    const response = await fetch(`/api/employee-market?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' })
    if (response.ok) setTemplates((await response.json()).templates)
    else setNotice(response.status === 403 ? 'Only project Owners and Admins can browse the Employee Market.' : 'The Employee Market is unavailable right now.')
    setLoading(false)
  }, [project.id])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 0); return () => clearTimeout(timer) }, [load])
  const toggle = (value: string, set: React.Dispatch<React.SetStateAction<string[]>>) => set(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  const open = (template: Template) => { setSelected(template); setSkills([]); setTools([]); setNotice('') }
  const hire = async () => {
    if (!selected) return
    setNotice('Saving your reviewed hiring configuration…')
    const response = await fetch('/api/employee-market', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, templateKey: selected.key, version: selected.version, selectedSkillKeys: skills, selectedToolKeys: tools }) })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) { setNotice(result.error || 'The employee could not be hired.'); return }
    setNotice(result.created ? `${selected.name} joined ${project.name}. No capabilities were granted.` : `${selected.name} is already hired for this project; no duplicate employee was created.`)
    setSelected(null)
  }
  return <div className="hq-rise">
    <PageHeader eyebrow={`${project.name} · Company`} title="Employee Market" description="Curated AI employee roles with explicit, reviewable capability recommendations." action={<StatusPill tone="accent">No auto-grants</StatusPill>} />
    <section className="panel mt-5 flex gap-3 p-4 text-xs text-[var(--ros-muted)]"><LockKeyhole className="mt-0.5 w-4 shrink-0 text-[var(--ros-accent)]"/><p>Hiring creates a project-owned employee and preserves the template version used. Skills, Tools, connections, credentials, and runtime access remain disabled until separately approved through their existing controls.</p></section>
    {notice && <p className="mt-4 rounded-xl border border-[var(--ros-line)] bg-white/[.02] p-3 text-xs text-[var(--ros-muted)]">{notice}</p>}
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{loading ? <section className="panel p-5 text-xs text-[var(--ros-faint)]">Loading curated roles…</section> : templates.map(template => <article className="panel flex flex-col p-5" key={`${template.key}:${template.version}`}><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgba(126,208,173,.1)] text-[var(--ros-accent)]"><BriefcaseBusiness className="w-4"/></span><StatusPill>v{template.version}</StatusPill></div><h2 className="mt-5 text-base font-semibold">{template.name}</h2><p className="mt-1 text-xs text-[var(--ros-muted)]">{template.role}</p><p className="mt-3 flex-1 text-[11px] leading-5 text-[var(--ros-faint)]">{template.description}</p><div className="mt-5 flex flex-wrap gap-1.5">{template.supportedSkillKeys.map(skill => <span className="rounded-full border border-[var(--ros-line)] px-2 py-1 text-[9px] text-[var(--ros-faint)]" key={skill}>{skill}</span>)}</div><button disabled={!canHire} onClick={() => open(template)} className="btn-primary mt-5 inline-flex items-center justify-center gap-2 px-3 py-2 text-xs disabled:opacity-50"><Sparkles className="w-3"/>{canHire ? 'Review & hire' : 'Owner or Admin only'}</button></article>)}</div>
    {!loading && !templates.length && !notice && <section className="panel mt-6"><EmptyState icon={<Sparkles/>} title="No employee templates available" description="Curated market templates will appear here when enabled by RogerOS." /></section>}
    {selected && <><button className="fixed inset-0 z-40 bg-black/55" aria-label="Close hiring review" onClick={() => setSelected(null)}/><aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] overflow-y-auto border-l border-[var(--ros-line)] bg-[var(--ros-surface-raised)] p-5 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Hiring review</p><h2 className="mt-2 text-xl font-semibold">{selected.name}</h2><p className="mt-1 text-xs text-[var(--ros-muted)]">Template {selected.key} · version {selected.version}</p></div><button className="btn-ghost px-3 py-2 text-xs" onClick={() => setSelected(null)}>Close</button></div><p className="mt-5 text-xs leading-5 text-[var(--ros-muted)]">{selected.soulSummary || selected.description}</p><section className="panel mt-6 p-4"><h3 className="text-xs font-semibold">Recommended Skills</h3><p className="mt-1 text-[10px] text-[var(--ros-faint)]">Your selections are recorded for review only. They do not create Skill assignments or runtime provisioning.</p><div className="mt-4 space-y-2">{selected.supportedSkillKeys.map(skill => <label className="flex items-center gap-2 text-[11px]" key={skill}><input type="checkbox" checked={skills.includes(skill)} onChange={() => toggle(skill, setSkills)}/>{skill}</label>)}</div></section><section className="panel mt-4 p-4"><h3 className="text-xs font-semibold">Recommended Tool access</h3><p className="mt-1 text-[10px] text-[var(--ros-faint)]">This records a recommendation only. It does not create a Tool permission, connection, or credential.</p><div className="mt-4 space-y-2">{selected.recommendedToolKeys.map(tool => <label className="flex items-center gap-2 text-[11px]" key={tool}><input type="checkbox" checked={tools.includes(tool)} onChange={() => toggle(tool, setTools)}/>{tool}</label>)}</div></section><section className="panel mt-4 p-4"><h3 className="text-xs font-semibold">KPI templates</h3><div className="mt-3 flex flex-wrap gap-2">{Array.isArray(selected.kpiTemplates) ? selected.kpiTemplates.filter(item => typeof item === 'string').map(item => <span className="rounded-full border border-[var(--ros-line)] px-2 py-1 text-[10px]" key={item}>{item}</span>) : null}</div></section><button className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-xs" onClick={() => void hire()}><CheckCircle2 className="w-4"/> Hire without granting access</button></aside></>}
  </div>
}
