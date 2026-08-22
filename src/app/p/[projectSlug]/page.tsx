/* eslint-disable react-hooks/error-boundaries */
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Activity, ArrowRight, Bot, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react'

import { Avatar, EmptyState, Metric, PageHeader, SectionTitle, StatusPill, friendlyLabel } from '@/components/rogeros-ui'
import { ProjectContextError, requireProjectContextBySlug } from '@/lib/project-context'
import { prisma } from '@/lib/prisma'

export default async function CommandCenter({ params }: { params: Promise<{ projectSlug: string }> }) {
  try {
    const context = await requireProjectContextBySlug((await params).projectSlug)
    const projectId = context.project.id
    const [activeWork, pendingApprovals, activeEmployees, attentionRuntimes, recentTasks, recentEvents] = await Promise.all([
      prisma.task.count({ where: { projectId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED'] } } }),
      prisma.approvalRequest.count({ where: { projectId, status: 'PENDING' } }),
      prisma.employeeProjectAssignment.count({ where: { projectId, status: 'ACTIVE' } }),
      prisma.hermesRuntimeAssignment.count({ where: { projectId, OR: [{ reconciliationState: 'FAILED' }, { provisioningState: 'FAILED' }, { assignmentState: 'SUSPENDED' }] } }),
      prisma.task.findMany({ where: { projectId }, orderBy: { updatedAt: 'desc' }, take: 6, include: { assignments: { include: { employeeProjectAssignment: { include: { employee: true } }, projectMember: { include: { organizationMember: { include: { user: true } } } } } } } }),
      prisma.auditEvent.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' }, take: 7, include: { actorEmployeeAssignment: { include: { employee: true } }, actorProjectMember: { include: { organizationMember: { include: { user: true } } } } } }),
    ])

    return <div className="hq-rise">
      <PageHeader eyebrow={`${context.organization.name} · Command Center`} title={`Good to see you. ${context.project.name} is ready.`} description="A live view of work, decisions and your AI workforce—drawn only from this project." action={<StatusPill tone="good">Project active</StatusPill>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Work in motion" value={activeWork} hint="Todo, active, review or blocked" tone={activeWork ? 'neutral' : 'good'} />
        <Metric label="Needs approval" value={pendingApprovals} hint={pendingApprovals ? 'Waiting for a decision' : 'Nothing waiting'} tone={pendingApprovals ? 'warn' : 'good'} />
        <Metric label="Active workforce" value={activeEmployees} hint="People and AI employees" />
        <Metric label="Runtime attention" value={attentionRuntimes} hint={attentionRuntimes ? 'Review Workforce status' : 'No runtime issues'} tone={attentionRuntimes ? 'bad' : 'good'} />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,.65fr)]">
        <section>
          <SectionTitle title="Active work" description="The most recently updated project tasks" action={<Link className="text-xs text-[var(--ros-accent)]" href={`/p/${context.project.slug}/tasks`}>Open Tasks <ArrowRight className="ml-1 inline w-3" /></Link>} />
          <div className="panel overflow-hidden">
            {recentTasks.length ? recentTasks.map((task, index) => {
              const assignment = task.assignments[0]
              const assignee = assignment?.employeeProjectAssignment?.employee.name || assignment?.projectMember?.organizationMember.user.name || 'Unassigned'
              return <Link key={task.id} href={`/p/${context.project.slug}/tasks`} className={`flex items-center gap-3 px-4 py-3.5 hover:bg-white/[.025] ${index ? 'border-t border-[var(--ros-line)]' : ''}`}>
                <Avatar name={assignee} size="sm" />
                <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium text-[var(--ros-text)]">{task.title}</p><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{assignee} · Updated {task.updatedAt.toLocaleDateString()}</p></div>
                <StatusPill tone={task.status === 'BLOCKED' ? 'bad' : task.status === 'DONE' ? 'good' : task.status === 'REVIEW' ? 'warn' : 'neutral'}>{friendlyLabel(task.status)}</StatusPill>
              </Link>
            }) : <EmptyState icon={<CheckCircle2 />} title="No work is waiting" description="Create a task to give your team or an AI employee a clear outcome." action={<Link className="btn-primary px-3 py-2 text-xs" href={`/p/${context.project.slug}/tasks`}>Create a task</Link>} />}
          </div>
        </section>

        <section>
          <SectionTitle title="Attention" description="Decisions and runtime signals" />
          <div className="space-y-3">
            <Link href={`/p/${context.project.slug}/approvals`} className="panel panel-interactive flex items-center gap-3 p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[rgba(228,189,104,.1)] text-[var(--ros-warn)]"><ShieldCheck className="w-4" /></span><div className="flex-1"><p className="text-[12px] font-medium">Approvals</p><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{pendingApprovals ? `${pendingApprovals} decision${pendingApprovals === 1 ? '' : 's'} waiting` : 'All caught up'}</p></div><StatusPill tone={pendingApprovals ? 'warn' : 'good'}>{pendingApprovals || 'Clear'}</StatusPill></Link>
            <Link href={`/p/${context.project.slug}/workforce`} className="panel panel-interactive flex items-center gap-3 p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[rgba(126,208,173,.09)] text-[var(--ros-accent)]"><Bot className="w-4" /></span><div className="flex-1"><p className="text-[12px] font-medium">AI workforce</p><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{attentionRuntimes ? 'One or more employees need attention' : 'Runtime assignments look healthy'}</p></div><StatusPill tone={attentionRuntimes ? 'bad' : 'good'}>{attentionRuntimes ? 'Review' : 'Ready'}</StatusPill></Link>
          </div>
        </section>
      </div>

      <section className="mt-8">
        <SectionTitle title="Recent business activity" description="A project-scoped record of meaningful actions" action={<Link className="text-xs text-[var(--ros-accent)]" href={`/p/${context.project.slug}/approvals`}>View audit</Link>} />
        <div className="panel overflow-hidden">
          {recentEvents.length ? recentEvents.map((event, index) => { const actor = event.actorEmployeeAssignment?.employee.name || event.actorProjectMember?.organizationMember.user.name || 'RogerOS'; return <div key={event.id} className={`flex gap-3 px-4 py-3 ${index ? 'border-t border-[var(--ros-line)]' : ''}`}><span className="mt-1 grid h-7 w-7 place-items-center rounded-lg bg-white/[.035] text-[var(--ros-muted)]"><Activity className="w-3.5" /></span><div className="min-w-0 flex-1"><p className="text-[12px] text-[var(--ros-text)]">{event.summary}</p><p className="mt-1 text-[10px] text-[var(--ros-faint)]">{actor} · {event.createdAt.toLocaleString()}</p></div></div> }) : <EmptyState icon={<Clock3 />} title="No recent activity" description="Project work, approvals and governed AI actions will appear here." />}
        </div>
      </section>
    </div>
  } catch (error) { if (error instanceof ProjectContextError) notFound(); throw error }
}
