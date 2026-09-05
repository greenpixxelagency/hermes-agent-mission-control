'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useCallback, useEffect, useState } from 'react'
import { Bot, RefreshCw, ShieldCheck } from 'lucide-react'

import { EmptyState, PageHeader, StatusPill } from '@/components/rogeros-ui'

type RuntimeAssignment = {
  id: string
  active: boolean
  profileKey: string
  assignmentState: string
  provisioningState: string
  reconciliationState: string
  runtimeStatus: string | null
  lastReconciledAt: string | null
  runtime: { key: string; name: string; status: string }
  employeeAssignment: { employee: { name: string } } | null
}
type Health = { healthy: boolean; hermesVersion: string; runtimeIdentity: string; checkedAt: string }

export function HermesConnectionSettings({ project }: { project: { id: string; slug: string; name: string; role: string } }) {
  const [assignments, setAssignments] = useState<RuntimeAssignment[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [assignmentResponse, healthResponse] = await Promise.all([
        fetch(`/api/runtime/assignments?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' }),
        fetch(`/api/runtime/health?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' }),
      ])
      if (!assignmentResponse.ok || !healthResponse.ok) throw new Error('RUNTIME_STATUS_UNAVAILABLE')
      const assignmentBody = await assignmentResponse.json() as { assignments: RuntimeAssignment[] }
      setAssignments(assignmentBody.assignments)
      setHealth(await healthResponse.json() as Health)
    } catch { setError('Hermes connection status is unavailable. No configuration was changed.') }
    finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { void load() }, [load])
  const canManage = project.role === 'OWNER' || project.role === 'ADMIN'
  const connected = Boolean(health?.healthy && assignments.some(assignment => assignment.active && assignment.assignmentState === 'ACTIVE'))

  return <div className="hq-rise">
    <PageHeader eyebrow={`${project.name} · Workspace control`} title="Project settings" description="Project-scoped runtime status and governed execution controls." />
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-[rgba(126,208,173,.2)] bg-[radial-gradient(circle_at_35%_30%,rgba(126,208,173,.18),rgba(126,208,173,.04)_58%,transparent_72%)]"><Image src="/hermes-agent.webp" alt="Hermes Agent" width={40} height={40} className="h-full w-full object-contain p-1.5 brightness-150 contrast-125" /></span><div><h2 className="text-sm font-semibold">Hermes connection</h2><p className="mt-1 max-w-2xl text-[11px] leading-5 text-[var(--ros-muted)]">Hermes is an execution runtime. RogerOS remains authoritative for this project’s membership, policies, approvals, tools, Project Brain, and audit history.</p></div></div><StatusPill tone={loading ? 'neutral' : connected ? 'good' : 'warn'}>{loading ? 'Checking' : connected ? 'Connected' : 'Not connected'}</StatusPill></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><Info label="Runtime service" value={health?.runtimeIdentity || (loading ? 'Checking…' : 'Unavailable')} /><Info label="Runtime health" value={health?.healthy ? 'Healthy' : loading ? 'Checking…' : 'Unavailable'} /><Info label="Hermes version" value={health?.hermesVersion || 'Not observed'} /></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-[rgba(235,130,122,.08)] p-3 text-[11px] text-[var(--ros-bad)]">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void load()} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-[11px]"><RefreshCw className="w-3.5" /> Refresh status</button>{canManage && <Link href={`/p/${project.slug}/workforce`} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-[11px]"><Bot className="w-3.5" /> Manage workforce runtimes</Link>}</div>
      <p className="mt-4 flex gap-2 text-[10px] leading-5 text-[var(--ros-faint)]"><ShieldCheck className="mt-0.5 w-3.5 shrink-0" />Adapter credentials are held server-side and are never displayed, entered, or returned here. A runtime assignment does not grant an employee Tool permissions or approval authority.</p>
    </section>
    <section className="mt-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Project runtime assignments</h2><span className="text-[10px] text-[var(--ros-faint)]">{assignments.length} configured</span></div>{!loading && assignments.length === 0 ? <div className="panel"><EmptyState icon={<Bot />} title="No Hermes runtime assigned" description={canManage ? 'Assign an AI employee to the approved runtime from Workforce.' : 'An Owner or Admin can assign an AI employee from Workforce.'} /></div> : <div className="grid gap-3 md:grid-cols-2">{assignments.map(assignment => <article className="panel p-4" key={assignment.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{assignment.employeeAssignment?.employee.name || 'Unassigned runtime'}</p><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{assignment.runtime.name} · profile {assignment.profileKey}</p></div><StatusPill tone={assignment.active && assignment.assignmentState === 'ACTIVE' && assignment.runtimeStatus === 'HEALTHY' ? 'good' : 'warn'}>{assignment.active ? assignment.runtimeStatus || assignment.reconciliationState : 'Inactive'}</StatusPill></div><p className="mt-4 text-[10px] text-[var(--ros-muted)]">Last reconciled: {assignment.lastReconciledAt ? new Date(assignment.lastReconciledAt).toLocaleString() : 'Not yet'}</p></article>)}</div>}</section>
  </div>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--ros-line)] bg-white/[.02] p-3"><p className="text-[9px] text-[var(--ros-faint)]">{label}</p><p className="mt-1 truncate text-[11px] font-medium">{value}</p></div> }
