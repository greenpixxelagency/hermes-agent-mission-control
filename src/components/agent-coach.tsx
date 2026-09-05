'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Lightbulb } from 'lucide-react'

import { EmptyState, StatusPill } from '@/components/rogeros-ui'

type Recommendation = { id: string; kind: string; employee: { name: string; role: string }; observation: string; evidence: Record<string, number>; proposedReview: string; safeguards: string[] }
type Coach = { recommendations: Recommendation[]; source: { statement: string }; limits: { maxRecommendations: number; returned: number } }

const labels: Record<string, string> = { WORK_ASSIGNMENT_REVIEW: 'Assignment review', RUNTIME_OUTCOME_REVIEW: 'Runtime outcome review', TOOL_FAILURE_REVIEW: 'Tool execution review' }

export function AgentCoach({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Coach | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/workforce/coach?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Coach recommendations are unavailable.')
      setData(await response.json())
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Coach recommendations are unavailable.') }
  }, [projectId])
  useEffect(() => { void load() }, [load])

  return <section className="panel mt-5 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Agent Coach · review queue</p><h2 className="mt-1 text-sm font-semibold">Human-reviewable improvement proposals</h2><p className="mt-1 max-w-3xl text-[10px] leading-5 text-[var(--ros-faint)]">Read-only M20 evidence is translated into transparent prompts for a human review. Nothing can be applied from this panel.</p></div><StatusPill tone="neutral">No changes</StatusPill></div>
    {error && <p role="status" className="mt-4 text-xs text-[var(--ros-bad)]">{error}</p>}
    {!error && !data && <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/[.03]"/>}
    {data && <><p className="mt-3 text-[10px] leading-5 text-[var(--ros-faint)]">{data.source.statement} Up to {data.limits.maxRecommendations} proposals are returned; this view has {data.limits.returned}.</p>{data.recommendations.length ? <div className="mt-4 grid gap-3 xl:grid-cols-2">{data.recommendations.map(item => <article key={item.id} className="rounded-xl border border-[var(--ros-line)] p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-medium">{item.employee.name}</h3><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{item.employee.role}</p></div><StatusPill tone="neutral">{labels[item.kind] || 'Review'}</StatusPill></div><p className="mt-3 text-[11px] leading-5 text-[var(--ros-muted)]">{item.observation}</p><p className="mt-3 rounded-lg bg-white/[.03] p-2.5 text-[10px] leading-5 text-[var(--ros-text)]"><strong>Proposed human review:</strong> {item.proposedReview}</p><details className="mt-3 text-[10px] text-[var(--ros-faint)]"><summary className="cursor-pointer">Evidence and safeguards</summary><p className="mt-2">{Object.entries(item.evidence).map(([key, value]) => `${key}: ${value}`).join(' · ')}</p><ul className="mt-2 list-disc space-y-1 pl-4">{item.safeguards.map(safeguard => <li key={safeguard}>{safeguard}</li>)}</ul></details></article>)}</div> : <div className="mt-4"><EmptyState icon={<Lightbulb/>} title="No review proposals in this range" description="M20 evidence did not meet this bounded Coach slice’s review thresholds."/></div>}<div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--ros-line)] p-3 text-[10px] leading-5 text-[var(--ros-faint)]"><ClipboardCheck className="mt-0.5 w-3.5 shrink-0"/>A reviewer may inspect the existing Workforce, Skills, Tools, policy, and runtime workflows separately. This Coach never creates or approves those changes.</div></>}
  </section>
}
