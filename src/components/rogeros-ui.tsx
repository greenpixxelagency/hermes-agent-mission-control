import type { ReactNode } from 'react'

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <header className="rogeros-page-header"><div className="min-w-0"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="shrink-0">{action}</div>}</header>
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'R'
  return <span className={`rogeros-avatar rogeros-avatar-${size}`} aria-hidden>{initials}</span>
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'accent' | 'neutral' }) {
  return <span className={`rogeros-status rogeros-status-${tone}`}><span aria-hidden />{children}</span>
}

export function Metric({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return <div className={`rogeros-metric rogeros-metric-${tone}`}><p>{label}</p><strong>{value}</strong>{hint && <span>{hint}</span>}</div>
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="rogeros-empty">{icon && <div className="rogeros-empty-icon">{icon}</div>}<h3>{title}</h3><p>{description}</p>{action && <div className="mt-4">{action}</div>}</div>
}

export function SectionTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="rogeros-section-title"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>
}

export const friendlyLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())
