'use client'

import Link from 'next/link'
import Image from 'next/image'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Bot, KeyRound, PlugZap, RefreshCw, ShieldCheck, X } from 'lucide-react'

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
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [configureOpen, setConfigureOpen] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [secret, setSecret] = useState('')
  const [configureNotice, setConfigureNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [assignmentResponse, healthResponse, connectionResponse] = await Promise.all([
        fetch(`/api/runtime/assignments?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' }),
        fetch(`/api/runtime/health?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' }),
        fetch(`/api/runtime/connection?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' }),
      ])
      if (!assignmentResponse.ok || !healthResponse.ok || !connectionResponse.ok) throw new Error('RUNTIME_STATUS_UNAVAILABLE')
      const assignmentBody = await assignmentResponse.json() as { assignments: RuntimeAssignment[] }
      setAssignments(assignmentBody.assignments)
      setHealth(await healthResponse.json() as Health)
      setConfigured((await connectionResponse.json() as { connected: boolean }).connected)
    } catch { setError('Hermes connection status is unavailable. No configuration was changed.') }
    finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { void load() }, [load])
  const canManage = project.role === 'OWNER' || project.role === 'ADMIN'
  const connected = Boolean(configured && health?.healthy && !error)
  const submitConfiguration = async (event: FormEvent) => {
    event.preventDefault()
    setConfigureNotice('Verifying the Hermes installation…')
    try {
      const response = await fetch('/api/runtime/connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, agentId, connectionSecret: secret }) })
      if (!response.ok) throw new Error('CONFIGURATION_FAILED')
      setSecret('')
      setConfigureNotice('Hermes is connected and verified. Refreshing the runtime status…')
      await load()
      setConfigureOpen(false)
    } catch { setConfigureNotice('Hermes could not be verified. Check the agent ID and connection secret, then try again.') }
  }
  const disconnect = async () => {
    if (!window.confirm('Disconnect Hermes from this project? RogerOS will delete its stored connection credential.')) return
    try {
      const response = await fetch('/api/runtime/connection', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) })
      if (!response.ok) throw new Error('DISCONNECT_FAILED')
      await load()
    } catch { setError('Hermes could not be disconnected. No credentials were changed.') }
  }

  return <div className="hq-rise">
    <PageHeader eyebrow={`${project.name} · Workspace control`} title="Project settings" description="Project-scoped runtime status and governed execution controls." />
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="grid h-10 w-10 place-items-center overflow-hidden rounded-xl border border-[rgba(126,208,173,.2)] bg-[radial-gradient(circle_at_35%_30%,rgba(126,208,173,.18),rgba(126,208,173,.04)_58%,transparent_72%)]"><Image src="/hermes-agent-light.webp" alt="Hermes Agent" width={40} height={40} className="h-full w-full object-contain p-1.5" /></span><div><h2 className="text-sm font-semibold">Hermes connection</h2><p className="mt-1 max-w-2xl text-[11px] leading-5 text-[var(--ros-muted)]">Hermes is an execution runtime. RogerOS remains authoritative for this project’s membership, policies, approvals, tools, Project Brain, and audit history.</p></div></div><StatusPill tone={loading ? 'neutral' : connected ? 'good' : 'warn'}>{loading ? 'Checking' : connected ? 'Connected' : 'Not connected'}</StatusPill></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><Info label="Runtime service" value={configured ? health?.runtimeIdentity || (loading ? 'Checking…' : 'Unavailable') : 'Not connected'} /><Info label="Runtime health" value={configured && health?.healthy ? 'Healthy' : loading ? 'Checking…' : 'Not connected'} /><Info label="Hermes version" value={configured ? health?.hermesVersion || 'Not observed' : 'Not observed'} /></div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-[rgba(235,130,122,.08)] p-3 text-[11px] text-[var(--ros-bad)]">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void load()} className="btn-ghost inline-flex items-center gap-2 px-3 py-2 text-[11px]"><RefreshCw className="w-3.5" /> Refresh status</button>{canManage && !connected && <button onClick={() => void (async()=>{const r=await fetch(`/api/hermes/authorize?projectId=${encodeURIComponent(project.id)}`);const d=await r.json() as {authorizationUrl?:string};if(d.authorizationUrl) window.location.assign(d.authorizationUrl)})()} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-[11px]"><PlugZap className="w-3.5" /> Connect Hermes</button>}{canManage && connected && <><Link href={`/p/${project.slug}/workforce`} className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-[11px]"><Bot className="w-3.5" /> Manage workforce runtimes</Link><button onClick={() => void disconnect()} className="btn-ghost px-3 py-2 text-[11px]">Disconnect Hermes</button></>}</div>
      <p className="mt-4 flex gap-2 text-[10px] leading-5 text-[var(--ros-faint)]"><ShieldCheck className="mt-0.5 w-3.5 shrink-0" />The connection secret is sent once over a secure server-side handshake and is never displayed or returned. A runtime assignment does not grant an employee Tool permissions or approval authority.</p>
    </section>
    <section className="mt-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Project runtime assignments</h2><span className="text-[10px] text-[var(--ros-faint)]">{assignments.length} configured</span></div>{!loading && assignments.length === 0 ? <div className="panel"><EmptyState icon={<Bot />} title="No Hermes runtime assigned" description={canManage ? 'Configure Hermes, then assign an AI employee from Workforce.' : 'An Owner or Admin can configure Hermes and assign an AI employee from Workforce.'} /></div> : <div className="grid gap-3 md:grid-cols-2">{assignments.map(assignment => <article className="panel p-4" key={assignment.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold">{assignment.employeeAssignment?.employee.name || 'Unassigned runtime'}</p><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{assignment.runtime.name} · profile {assignment.profileKey}</p></div><StatusPill tone={assignment.active && assignment.assignmentState === 'ACTIVE' && assignment.runtimeStatus === 'HEALTHY' ? 'good' : 'warn'}>{assignment.active ? assignment.runtimeStatus || assignment.reconciliationState : 'Inactive'}</StatusPill></div><p className="mt-4 text-[10px] text-[var(--ros-muted)]">Last reconciled: {assignment.lastReconciledAt ? new Date(assignment.lastReconciledAt).toLocaleString() : 'Not yet'}</p></article>)}</div>}</section>
    {configureOpen && <><button aria-label="Close Hermes configuration" className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={() => setConfigureOpen(false)} /><section role="dialog" aria-modal="true" aria-labelledby="hermes-configure-title" className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#111411] p-6 shadow-[-24px_0_80px_rgba(0,0,0,.45)]"><div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5"><div><p className="eyebrow">Project runtime</p><h2 id="hermes-configure-title" className="mt-2 text-xl font-semibold">Connect Hermes</h2><p className="mt-2 text-xs leading-5 text-[var(--ros-muted)]">Use a Hermes integration identity and connection secret. RogerOS never collects an administrator password.</p></div><button className="rounded-full border border-white/10 bg-white/[.04] p-2 text-[var(--ros-muted)] transition hover:bg-white/[.08] hover:text-[var(--ros-text)]" aria-label="Close Hermes configuration" onClick={() => setConfigureOpen(false)}><X className="w-4" /></button></div><form onSubmit={submitConfiguration} className="mt-7 space-y-5"><label className="block text-xs font-medium">Hermes integration ID<input required value={agentId} onChange={event => setAgentId(event.target.value)} autoComplete="off" placeholder="Hermes integration UUID" className="mt-2 w-full border-white/10 bg-white/[.055] px-3 py-3 text-xs" /></label><label className="block text-xs font-medium">Connection secret<input required type="password" value={secret} onChange={event => setSecret(event.target.value)} autoComplete="new-password" placeholder="Hermes connection secret" className="mt-2 w-full border-white/10 bg-white/[.055] px-3 py-3 text-xs" /></label><p className="flex gap-2 rounded-xl border border-white/[.07] bg-white/[.025] p-3 text-[10px] leading-5 text-[var(--ros-faint)]"><KeyRound className="mt-0.5 w-3.5 shrink-0" />These required credentials are verified server-side, encrypted at rest, and never displayed after submission.</p>{configureNotice && <p role="status" className="rounded-xl border border-white/[.08] bg-white/[.04] p-3 text-[11px] leading-5 text-[var(--ros-muted)]">{configureNotice}</p>}<button className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-xs"><PlugZap className="w-3.5" /> Connect Hermes</button></form></section></>}
  </div>
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[var(--ros-line)] bg-white/[.02] p-3"><p className="text-[9px] text-[var(--ros-faint)]">{label}</p><p className="mt-1 truncate text-[11px] font-medium">{value}</p></div> }
