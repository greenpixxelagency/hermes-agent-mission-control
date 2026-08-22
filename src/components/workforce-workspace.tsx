'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type RuntimeAssignment = {
  id: string
  active: boolean
  profileKey: string
  runtimeKind: string
  assignmentState: string
  provisioningState: string
  reconciliationState: string
  desiredDisplayName: string | null
  lastObservedHermesVersion: string | null
  capabilityFingerprint: string | null
  lastReconciledAt: string | null
  runtimeStatus: string | null
  externalRuntimeMetadata: { botChatAvailable?: boolean; skillCount?: number; skills?:Array<{key:string;name:string;bundled:boolean}>; routinesAvailable?: boolean; routines?:Array<{id:string;name:string;enabled:boolean}> } | null
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
type ChatMessage = { id:string; body:string; kind:string; createdAt:string; authorUserId:string|null; authorSystemIdentity:string|null }

export function WorkforceWorkspace({ project }: { project: { id: string; name: string; role: string } }) {
  const [items, setItems] = useState<EmployeeAssignment[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Record<string,string>>({})
  const [chat, setChat] = useState<Record<string,string>>({})
  const [history, setHistory] = useState<Record<string,ChatMessage[]>>({})
  const [openChat, setOpenChat] = useState('')
  const [working, setWorking] = useState('')

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

  const runtimeAction = async (assignmentId:string,path:string,body:Record<string,unknown>) => {
    setWorking(`${assignmentId}:${path}`);setError('')
    try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project.id,employeeProjectAssignmentId:assignmentId,...body})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Runtime action failed');setNotice(current=>({...current,[assignmentId]:result.result||'Runtime action completed.'}));if(path.includes('/chat')){setChat(current=>({...current,[assignmentId]:''}));await loadHistory(assignmentId)}await load()}catch(actionError){setNotice(current=>({...current,[assignmentId]:actionError instanceof Error?actionError.message:'Runtime action failed'}))}finally{setWorking('')}
  }
  const loadHistory=async(assignmentId:string)=>{const response=await fetch(`/api/runtime/bots/chat?projectId=${encodeURIComponent(project.id)}&employeeProjectAssignmentId=${encodeURIComponent(assignmentId)}`);if(response.ok){const result=await response.json();setHistory(current=>({...current,[assignmentId]:result.messages}))}}
  const toggleChat=async(assignmentId:string)=>{const next=openChat===assignmentId?'':assignmentId;setOpenChat(next);if(next)await loadHistory(assignmentId)}
  const canOperate=['OWNER','ADMIN','OPERATOR'].includes(project.role)
  const canAdmin=['OWNER','ADMIN'].includes(project.role)

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
        {runtime ? <div className="mt-4 rounded-lg border border-[var(--line)] p-3"><p className="eyebrow">Hermes runtime</p><div className="mt-2 space-y-1 text-xs text-[var(--text-3)]"><p>Runtime: {runtime.runtimeStatus==='HEALTHY'?'Connected':runtime.runtimeStatus||runtime.runtime.key}</p><p>Bot: {runtime.desiredDisplayName||runtime.profileKey}</p><p>Profile: {runtime.profileKey}</p><p>Status: {runtime.assignmentState}</p><p>Hermes: {runtime.lastObservedHermesVersion||health?.hermesVersion||'Not observed'}</p><p>Bot Chat: {runtime.externalRuntimeMetadata?.botChatAvailable?'Ready':'Not observed'}</p><p>Skills: {runtime.externalRuntimeMetadata?.skills?.map(skill=>skill.name).join(', ')||`${runtime.externalRuntimeMetadata?.skillCount??'—'} observed`}</p><p>Routines: {runtime.externalRuntimeMetadata?.routines?.length?runtime.externalRuntimeMetadata.routines.map(routine=>`${routine.name} (${routine.enabled?'enabled':'disabled'})`).join(', '):runtime.externalRuntimeMetadata?.routinesAvailable?'Available (scheduler deferred)':'Not observed'}</p><p>Reconciliation: {runtime.reconciliationState.replace('_',' ')}</p><p>Capability: {runtime.capabilityFingerprint?runtime.capabilityFingerprint.slice(0,16)+'…':'Not observed'}</p><p>Last synced: {runtime.lastReconciledAt?new Date(runtime.lastReconciledAt).toLocaleString():'Never'}</p><p>Latest task execution: {latest?.status ?? 'None'}</p></div>
          <div className="mt-3 flex flex-wrap gap-2">{canAdmin&&<button disabled={working!==''} onClick={()=>void runtimeAction(item.id,'/api/runtime/bots/reconcile',{})} className="btn-ghost px-3 py-2 text-xs">Reconcile Bot</button>}{canAdmin&&<button disabled={working!==''} onClick={()=>void runtimeAction(item.id,'/api/runtime/bots/state',{action:runtime.assignmentState==='SUSPENDED'?'resume':'suspend'})} className="btn-ghost px-3 py-2 text-xs">{runtime.assignmentState==='SUSPENDED'?'Resume AI Employee':'Suspend AI Employee'}</button>}</div>
          {canOperate&&<div className="mt-3"><button onClick={()=>void toggleChat(item.id)} className="btn-ghost px-3 py-2 text-xs">{openChat===item.id?'Hide Bot Chat':'Open Bot Chat'}</button>{openChat===item.id&&<div className="mt-3"><div className="max-h-48 space-y-2 overflow-y-auto rounded border border-[var(--line)] p-2">{(history[item.id]||[]).length?(history[item.id]||[]).map(message=><div key={message.id} className="text-xs"><span className="font-semibold">{message.authorSystemIdentity?'Bot':'You'}:</span> <span className="whitespace-pre-wrap text-[var(--text-2)]">{message.body}</span></div>):<p className="text-xs text-[var(--text-3)]">No Bot Chat messages yet.</p>}</div><textarea aria-label={`Message ${item.employee.name}`} value={chat[item.id]||''} onChange={event=>setChat(current=>({...current,[item.id]:event.target.value}))} placeholder="Message this AI employee" className="mt-2 min-h-20 w-full rounded border border-[var(--line)] bg-transparent p-2 text-xs"/><button disabled={working!==''||runtime.assignmentState!=='ACTIVE'||!(chat[item.id]||'').trim()} onClick={()=>void runtimeAction(item.id,'/api/runtime/bots/chat',{message:chat[item.id]})} className="btn-primary mt-2 px-3 py-2 text-xs">Send to Bot</button></div>}</div>}
          {notice[item.id]&&<p className="mt-3 whitespace-pre-wrap text-xs text-[var(--accent)]">{notice[item.id]}</p>}
        </div> : <p className="mt-4 text-xs text-[var(--text-3)]">Runtime: Not assigned</p>}
        <p className="mt-4 text-xs text-[var(--text-3)]">{item._count.taskAssignments} assigned tasks · {item.status}</p>
      </article>
    })}</div>
  </div>
}
