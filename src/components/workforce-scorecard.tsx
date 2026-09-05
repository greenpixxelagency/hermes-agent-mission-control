'use client'

import { useCallback, useEffect, useState } from 'react'
import { ReceiptText } from 'lucide-react'

import { EmptyState, StatusPill } from '@/components/rogeros-ui'

type Worker = {
  employee: { name: string; role: string; employmentStatus: string }
  assignedWork: { assignedInRange: number; completedInRange: number }
  runtimeAttempts: { createdInRange: number; succeededInRange: number; acceptedInRange: number }
  governedToolExecutions: { createdInRange: number; succeededInRange: number; failedInRange: number }
  cost: { actualAmount: null; currency: null; availability: 'UNKNOWN'; reason: 'NO_PROVIDER_USAGE_RECORD' }
}
type Scorecard = { range: { start: string; end: string; days: number }; provenance: { assignedWork: string; runtimeAttempts: string; governedToolExecutions: string; cost: string }; workers: Worker[] }

export function WorkforceScorecard({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Scorecard | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/workforce/scorecard?projectId=${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Workforce evidence is unavailable.')
      setData(await response.json())
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Workforce evidence is unavailable.') }
  }, [projectId])
  useEffect(() => { void load() }, [load])

  return <section className="panel mt-5 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Evidence · last {data?.range.days ?? 30} days</p><h2 className="mt-1 text-sm font-semibold">Workforce outcome and cost facts</h2><p className="mt-1 max-w-3xl text-[10px] leading-5 text-[var(--ros-faint)]">Observed project records only. This is not a productivity rating, recommendation, or provider billing statement.</p></div><StatusPill tone="neutral">Read-only evidence</StatusPill></div>
    {error && <p role="status" className="mt-4 text-xs text-[var(--ros-bad)]">{error}</p>}
    {!error && !data && <div className="mt-4 h-24 animate-pulse rounded-xl bg-white/[.03]"/>}
    {data && <>{data.workers.length ? <div className="mt-4 grid gap-3 xl:grid-cols-2">{data.workers.map(worker => <article key={worker.employee.name} className="rounded-xl border border-[var(--ros-line)] p-3"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-medium">{worker.employee.name}</h3><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{worker.employee.role} · {worker.employee.employmentStatus.toLowerCase()}</p></div><StatusPill tone="neutral">Cost unknown</StatusPill></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-[var(--ros-muted)]"><p>Assigned: <strong className="text-[var(--ros-text)]">{worker.assignedWork.assignedInRange}</strong></p><p>Completed: <strong className="text-[var(--ros-text)]">{worker.assignedWork.completedInRange}</strong></p><p>Accepted results: <strong className="text-[var(--ros-text)]">{worker.runtimeAttempts.acceptedInRange}</strong></p><p>Tool successes: <strong className="text-[var(--ros-text)]">{worker.governedToolExecutions.succeededInRange}</strong></p></div><p className="mt-3 text-[10px] text-[var(--ros-faint)]">No provider usage record is available, so no actual or estimated cost is shown.</p></article>)}</div> : <div className="mt-4"><EmptyState icon={<ReceiptText/>} title="No project employees yet" description="Evidence appears when this project has workforce assignments."/></div>}<details className="mt-4 text-[10px] text-[var(--ros-faint)]"><summary className="cursor-pointer">Evidence provenance and range</summary><p className="mt-2">{data.provenance.assignedWork}. {data.provenance.runtimeAttempts}. {data.provenance.governedToolExecutions}. {data.provenance.cost}</p></details></>}
  </section>
}
