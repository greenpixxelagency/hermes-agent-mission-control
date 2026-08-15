'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type RuntimeAssignment = {
  id: string
  active: boolean
  profileKey: string
  runtime: { key: string; name: string; status: string }
  executions: Array<{ status: string; createdAt: string; resultText: string | null }>
}
type EmployeeAssignment = {
  id: string
  status: string
  employee: { name: string; role: string; description: string | null; type: string; status: string; systemKey: string | null }
  runtimeAssignments: RuntimeAssignment[]
  _count: { taskAssignments: number }
}
type Health = { healthy: boolean; hermesVersion: string; runtimeIdentity: string; checkedAt: string }

export function WorkforceWorkspace({ project }: { project: { id: string; name: string } }) {
  const [items, setItems] = useState<EmployeeAssignment[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [employees, runtimeHealth] = await Promise.all([
      fetch(`/api/workforce?projectId=${project.id}`),
      fetch(`/api/runtime/health?projectId=${project.id}`),
    ])
    if (employees.ok) setItems((await employees.json()).employees)
    if (runtimeHealth.ok) setHealth(await runtimeHealth.json())
  }, [project.id])
  useEffect(() => {
    const timer = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    const response = await fetch('/api/workforce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, name, role }) })
    if (!response.ok) { setError('Unable to create employee'); return }
    setName(''); setRole(''); await load()
  }

  return <div className="hq-rise">
    <p className="eyebrow">{project.name} / Workforce</p>
    <h1 className="mt-1 text-3xl font-semibold">Workforce</h1>
    <p className="mt-2 text-sm text-[var(--text-2)]">Project-assigned employees and their project-scoped runtime assignments.</p>
    {health && <p className="mt-3 text-xs text-[var(--text-3)]">Staging Hermes: {health.healthy ? 'Healthy' : 'Unavailable'} · {health.runtimeIdentity} · {health.hermesVersion}</p>}
    <form onSubmit={create} className="mt-6 flex flex-wrap gap-2">
      <input value={name} onChange={event => setName(event.target.value)} placeholder="Employee name" className="rounded border border-[var(--line)] bg-transparent p-2 text-sm" />
      <input value={role} onChange={event => setRole(event.target.value)} placeholder="Role" className="rounded border border-[var(--line)] bg-transparent p-2 text-sm" />
      <button className="btn-primary px-4 text-sm">Add Employee</button>
    </form>
    {error && <p className="mt-3 text-sm text-[var(--down)]">{error}</p>}
    <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map(item => {
      const runtime = item.runtimeAssignments[0]
      const latest = runtime?.executions[0]
      return <article key={item.id} className="panel p-4">
        <div className="flex justify-between"><h2 className="font-semibold">{item.employee.name}</h2><span className="text-xs text-[var(--accent)]">{item.employee.type === 'SYSTEM' ? 'System Employee' : 'Custom'}</span></div>
        <p className="mt-1 text-sm text-[var(--text-2)]">{item.employee.role}</p>
        {runtime ? <div className="mt-4 space-y-1 text-xs text-[var(--text-3)]"><p>Runtime: {runtime.runtime.key} · {runtime.active ? 'Active' : 'Inactive'}</p><p>Profile: {runtime.profileKey}</p><p>Latest execution: {latest?.status ?? 'None'}</p></div> : <p className="mt-4 text-xs text-[var(--text-3)]">Runtime: Not assigned</p>}
        <p className="mt-4 text-xs text-[var(--text-3)]">{item._count.taskAssignments} assigned tasks · {item.status}</p>
      </article>
    })}</div>
  </div>
}
