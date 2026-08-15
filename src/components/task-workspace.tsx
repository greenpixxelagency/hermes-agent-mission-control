'use client'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'

type RuntimeExecution = { id: string; status: string; resultText: string | null; errorMessage: string | null; createdAt: string; completedAt: string | null; runtime: { key: string } }
type Task = {
  id: string; title: string; description: string | null; status: string; priority: string; dueAt: string | null; updatedAt: string
  relatedThread: { id: string; title: string | null } | null
  assignments: Array<{ projectMember: { organizationMember: { user: { name: string | null; email: string | null } } } | null; employeeProjectAssignment?: { employee: { name: string }; runtimeAssignments?: Array<{ profileKey: string; runtime: { key: string } }> } | null }>
  subtasks: Array<{ id: string; status: string }>
  activities?: Array<{ id: string; detail: string | null; createdAt: string }>
  hermesExecutions?: RuntimeExecution[]
}
const statuses = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'BLOCKED']
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

export function TaskWorkspace({ project, currentMemberId }: { project: { id: string; name: string }; currentMemberId: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [view, setView] = useState<'board' | 'list'>('board')
  const [selected, setSelected] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [dispatching, setDispatching] = useState(false)
  const query = useMemo(() => `projectId=${encodeURIComponent(project.id)}`, [project.id])
  const load = useCallback(async () => {
    const response = await fetch(`/api/tasks2?${query}`)
    if (!response.ok) throw Error()
    setTasks((await response.json()).tasks)
  }, [query])
  const reloadSelected = async (id: string) => {
    const response = await fetch(`/api/tasks2/${id}?${query}`)
    if (!response.ok) throw Error()
    setSelected((await response.json()).task)
  }
  useEffect(() => { load().catch(() => setError('Unable to load tasks.')).finally(() => setLoading(false)) }, [load])

  const create = async (event: FormEvent) => {
    event.preventDefault(); if (!title.trim()) return
    const response = await fetch('/api/tasks2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, title, projectMemberId: currentMemberId }) })
    if (!response.ok) { setError('Unable to create task.'); return }
    setTitle(''); await load()
  }
  const patch = async (id: string, data: object) => {
    const response = await fetch(`/api/tasks2/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, ...data }) })
    if (!response.ok) { setError('Unable to update task.'); return }
    await load(); if (selected) await reloadSelected(id)
  }
  const open = async (task: Task) => { try { await reloadSelected(task.id) } catch { setError('Task not found.') } }
  const dispatch = async () => {
    if (!selected) return
    setDispatching(true); setError('')
    try {
      const response = await fetch('/api/runtime/dispatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, taskId: selected.id }) })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Dispatch failed') }
      await reloadSelected(selected.id); await load()
    } catch (dispatchError) { setError(dispatchError instanceof Error ? dispatchError.message : 'Unable to dispatch task.') } finally { setDispatching(false) }
  }
  const refresh = async (executionId: string) => {
    if (!selected) return
    const response = await fetch(`/api/runtime/executions/${executionId}/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) })
    if (!response.ok) { setError('Unable to refresh runtime status.'); return }
    await reloadSelected(selected.id)
  }
  const assignee = (task: Task) => task.assignments[0]?.employeeProjectAssignment?.employee.name || task.assignments[0]?.projectMember?.organizationMember.user.name || 'Unassigned'
  const card = (task: Task) => <button key={task.id} onClick={() => open(task)} className="mb-2 w-full rounded-lg border border-[var(--line)] bg-white/[.02] p-3 text-left hover:bg-white/[.06]"><div className="flex justify-between gap-2"><strong className="text-sm">{task.title}</strong><span className="text-[10px] text-[var(--warn)]">{task.priority}</span></div><p className="mt-2 text-xs text-[var(--text-3)]">{assignee(task)}{task.dueAt ? ` · due ${new Date(task.dueAt).toLocaleDateString()}` : ''}</p>{task.relatedThread && <p className="mt-1 text-xs text-[var(--accent)]">Linked thread</p>}</button>

  const runtime = selected?.assignments.find(assignment => assignment.employeeProjectAssignment?.runtimeAssignments?.[0])?.employeeProjectAssignment?.runtimeAssignments?.[0]
  return <div className="hq-rise"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">{project.name} / Work</p><h1 className="mt-1 text-3xl font-semibold">Tasks</h1></div><div className="rounded-lg border border-[var(--line)] p-1"><button onClick={() => setView('board')} className={`rounded px-3 py-1 text-sm ${view === 'board' ? 'bg-white/10' : ''}`}>Board</button><button onClick={() => setView('list')} className={`rounded px-3 py-1 text-sm ${view === 'list' ? 'bg-white/10' : ''}`}>List</button></div></div>
    {error && <p role="alert" className="mb-3 text-sm text-[var(--down)]">{error}</p>}
    <form onSubmit={create} className="mb-5 flex gap-2"><input value={title} onChange={event => setTitle(event.target.value)} placeholder="Create a task" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--surface-1)] px-3 py-2 text-sm" /><button className="btn-primary px-4 text-sm">Create task</button></form>
    {loading ? <p className="text-sm text-[var(--text-3)]">Loading tasks…</p> : view === 'board' ? <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">{statuses.map(status => <section key={status} className="min-w-44 rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-2"><h2 className="eyebrow px-1 py-2">{status.replace('_', ' ')}</h2>{tasks.filter(task => task.status === status).map(card)}</section>)}</div> : <div className="overflow-x-auto rounded-xl border border-[var(--line)]"><table className="w-full text-left text-sm"><thead className="border-b border-[var(--line)] text-[var(--text-3)]"><tr><th className="p-3">Task</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Due</th></tr></thead><tbody>{tasks.map(task => <tr key={task.id} onClick={() => open(task)} className="cursor-pointer border-b border-[var(--line)] hover:bg-white/[.03]"><td className="p-3 font-medium">{task.title}</td><td>{task.status}</td><td>{task.priority}</td><td>{assignee(task)}</td><td>{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : '—'}</td></tr>)}</tbody></table></div>}
    {selected && <aside className="fixed inset-y-0 right-0 z-20 w-full max-w-md overflow-y-auto border-l border-[var(--line)] bg-[#10141d] p-5 shadow-2xl"><button onClick={() => setSelected(null)} className="text-sm text-[var(--text-3)]">Close</button><h2 className="mt-4 text-xl font-semibold">{selected.title}</h2><p className="mt-3 whitespace-pre-wrap text-sm text-[var(--text-2)]">{selected.description || 'No objective added.'}</p>
      <label className="mt-5 block text-xs text-[var(--text-3)]">Status<select value={selected.status} onChange={event => patch(selected.id, { status: event.target.value })} className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface-2)] p-2 text-sm">{statuses.map(status => <option key={status}>{status}</option>)}<option>CANCELLED</option></select></label>
      <label className="mt-4 block text-xs text-[var(--text-3)]">Priority<select value={selected.priority} onChange={event => patch(selected.id, { priority: event.target.value })} className="mt-1 w-full rounded border border-[var(--line)] bg-[var(--surface-2)] p-2 text-sm">{priorities.map(priority => <option key={priority}>{priority}</option>)}</select></label><button onClick={() => patch(selected.id, { projectMemberId: currentMemberId })} className="btn-ghost mt-4 px-3 py-2 text-sm">Assign me</button>
      <section className="mt-6 rounded-lg border border-[var(--line)] p-3"><h3 className="text-sm font-semibold">Hermes runtime</h3>{runtime ? <><p className="mt-2 text-xs text-[var(--text-3)]">{runtime.runtime.key} · {runtime.profileKey}</p><button disabled={dispatching} onClick={dispatch} className="btn-primary mt-3 px-3 py-2 text-sm">{dispatching ? 'Dispatching…' : 'Dispatch to Hermes'}</button></> : <p className="mt-2 text-xs text-[var(--text-3)]">No active runtime assignment for this task&apos;s employee.</p>}
        {(selected.hermesExecutions || []).map(execution => <article key={execution.id} className="mt-3 border-t border-[var(--line)] pt-3 text-xs"><div className="flex justify-between gap-3"><span>{execution.status} · {execution.runtime.key}</span>{['QUEUED', 'DISPATCHING', 'RUNNING'].includes(execution.status) && <button onClick={() => refresh(execution.id)} className="text-[var(--accent)]">Refresh</button>}</div>{execution.resultText && <p className="mt-2 whitespace-pre-wrap text-[var(--text-2)]">{execution.resultText}</p>}{execution.errorMessage && <p className="mt-2 text-[var(--down)]">{execution.errorMessage}</p>}<p className="mt-1 text-[var(--text-3)]">{new Date(execution.createdAt).toLocaleString()}</p></article>)}</section>
      <p className="mt-5 text-sm">Subtasks: {selected.subtasks?.length || 0}</p><button onClick={() => { const child = prompt('Subtask title'); if (child) fetch('/api/tasks2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id, title: child, parentTaskId: selected.id, projectMemberId: currentMemberId }) }).then(() => load()) }} className="btn-ghost mt-2 px-3 py-2 text-sm">Add subtask</button>{selected.relatedThread && <p className="mt-5 text-sm text-[var(--accent)]">Related Thread: {selected.relatedThread.title || 'Conversation thread'}</p>}<h3 className="mt-6 text-sm font-semibold">Activity</h3>{selected.activities?.map(activity => <p key={activity.id} className="mt-2 text-xs text-[var(--text-3)]">{activity.detail} · {new Date(activity.createdAt).toLocaleString()}</p>)}</aside>}
  </div>
}
