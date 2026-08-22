'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Library, ShieldCheck, Sparkles } from 'lucide-react'

import { EmptyState, PageHeader, StatusPill } from '@/components/rogeros-ui'

type Skill = { id:string; name:string; description:string; category:string; version:string; sourceType:string; assignments:Array<{id:string;employeeProjectAssignmentId:string}> }

export function SkillLibraryWorkspace({ project }: { project: { id:string; name:string } }) {
  const [skills,setSkills]=useState<Skill[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('')
  const load=useCallback(async()=>{setLoading(true);const response=await fetch(`/api/skills?projectId=${encodeURIComponent(project.id)}`);if(response.ok){setSkills((await response.json()).skills);setError('')}else setError('The trusted capability library could not be loaded.');setLoading(false)},[project.id])
  useEffect(()=>{const timer=setTimeout(()=>{void load()},0);return()=>clearTimeout(timer)},[load])
  return <div className="hq-rise"><PageHeader eyebrow={`${project.name} · Company capabilities`} title="Skills" description="Trusted professional capabilities that can be assigned to your AI workforce." action={<StatusPill tone="accent"><ShieldCheck className="mr-1 h-3 w-3"/>Trusted library</StatusPill>}/>
    {error&&<div role="alert" className="mb-4 rounded-xl border border-[rgba(235,130,122,.25)] bg-[rgba(235,130,122,.08)] px-4 py-3 text-xs text-[var(--ros-bad)]">{error}</div>}
    {loading?<section className="panel p-6 text-xs text-[var(--ros-muted)]">Loading trusted capabilities…</section>:skills.length?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{skills.map(skill=><article key={skill.id} className="panel p-5"><div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgba(126,208,173,.1)] text-[var(--ros-accent)]"><Sparkles className="h-4 w-4"/></span><StatusPill tone="good"><CheckCircle2 className="mr-1 h-3 w-3"/>Trusted</StatusPill></div><p className="eyebrow mt-5">{skill.category}</p><h2 className="mt-2 text-sm font-semibold">{skill.name}</h2><p className="mt-2 min-h-10 text-[10px] leading-5 text-[var(--ros-muted)]">{skill.description}</p><div className="mt-5 flex items-center justify-between border-t border-[var(--ros-line)] pt-4 text-[9px] text-[var(--ros-faint)]"><span>Version {skill.version}</span><span>{skill.assignments.length?`${skill.assignments.length} assigned`:'Available'}</span></div></article>)}</div>:<section className="panel"><EmptyState icon={<Library/>} title="No trusted capabilities yet" description="Approved business capabilities will appear here when they are ready for your workforce."/></section>}
  </div>
}
