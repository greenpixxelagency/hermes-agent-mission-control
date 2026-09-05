import Link from 'next/link'
import { BookOpen, CheckCircle2, Users } from 'lucide-react'

type SetupChecklistProps = {
  project: { slug: string }
  taskCount: number
  employeeCount: number
  brainRecordCount: number
}

export function ProjectSetupChecklist({ project, taskCount, employeeCount, brainRecordCount }: SetupChecklistProps) {
  const steps = [
    { label: 'Create your first task', description: 'Give the project a clear outcome to work toward.', href: `/p/${project.slug}/tasks`, complete: taskCount > 0, icon: CheckCircle2 },
    { label: 'Build your project team', description: 'Add a person or AI employee when work needs an owner.', href: `/p/${project.slug}/workforce`, complete: employeeCount > 0, icon: Users },
    { label: 'Add reusable project context', description: 'Capture a decision, knowledge item, or operating procedure.', href: `/p/${project.slug}/brain`, complete: brainRecordCount > 0, icon: BookOpen },
  ]
  const completeCount = steps.filter(step => step.complete).length

  if (completeCount === steps.length) return null

  return <section className="panel mb-8 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--ros-line)] px-5 py-4">
      <div><p className="eyebrow">First steps</p><h2 className="mt-1 text-sm font-semibold">Make this project useful</h2><p className="mt-1 text-[11px] text-[var(--ros-faint)]">Complete these small steps in any order. RogerOS will not grant app or employee access automatically.</p></div>
      <span className="rogeros-status rogeros-status-accent"><span aria-hidden />{completeCount} of {steps.length} complete</span>
    </div>
    <ol className="divide-y divide-[var(--ros-line)]">
      {steps.map(step => {
        const Icon = step.complete ? CheckCircle2 : step.icon
        const iconClass = step.complete ? 'bg-[rgba(126,208,173,.1)] text-[var(--ros-good)]' : 'bg-white/[.035] text-[var(--ros-muted)]'
        return <li key={step.label} className="flex items-center gap-3 px-5 py-4">
          <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconClass}`}><Icon className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><h3 className="text-xs font-medium">{step.label}</h3><p className="mt-1 text-[10px] leading-4 text-[var(--ros-faint)]">{step.description}</p></div>
          {step.complete ? <span className="text-[10px] font-medium text-[var(--ros-good)]">Done</span> : <Link className="btn-ghost shrink-0 px-3 py-2 text-[10px]" href={step.href}>Open</Link>}
        </li>
      })}
    </ol>
  </section>
}
