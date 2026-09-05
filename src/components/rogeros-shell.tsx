'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { Activity, AppWindow, Bot, Brain, CheckCircle2, ChevronDown, Command, FileBarChart, HardDrive, LayoutDashboard, Menu, Search, Settings, ShieldCheck, Sparkles, Users, X } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import type { ProjectSearchResult } from '@/lib/project-search'

type ShellProject = { id: string; name: string; slug: string; role?: string }
type SwitcherProject = { name: string; slug: string }
type NavItem = { label: string; path: string; icon: typeof LayoutDashboard; foundation?: boolean }
const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Work', items: [{ label: 'Command Center', path: '', icon: LayoutDashboard }, { label: 'Team', path: 'team', icon: Users }, { label: 'Tasks', path: 'tasks', icon: CheckCircle2 }] },
  { label: 'Company', items: [{ label: 'Workforce', path: 'workforce', icon: Bot }, { label: 'Project Brain', path: 'brain', icon: Brain }, { label: 'Google Drive', path: 'drive', icon: HardDrive }, { label: 'Tools', path: 'tools', icon: AppWindow }, { label: 'Market', path: 'market', icon: Sparkles, foundation: true }] },
  { label: 'Control', items: [{ label: 'Approvals', path: 'approvals', icon: ShieldCheck }, { label: 'Reports', path: 'reports', icon: FileBarChart, foundation: true }, { label: 'Automations', path: 'automations', icon: Activity, foundation: true }] },
]

export function RogerOSShell({ children, project, projects, organization, accountLabel }: { children: React.ReactNode; project: ShellProject; projects: SwitcherProject[]; organization: string; accountLabel: string }) {
  const pathname = usePathname(); const router = useRouter(); const [mobileOpen, setMobileOpen] = useState(false); const [commandOpen, setCommandOpen] = useState(false)
  const suffix = pathname.split('/').slice(3).join('/'); const allItems = useMemo(() => groups.flatMap(group => group.items), []); const initials = accountLabel.slice(0, 2).toUpperCase()
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(value => !value) } if (event.key === 'Escape') { setCommandOpen(false); setMobileOpen(false) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])
  const hrefFor = (path: string) => `/p/${project.slug}${path ? `/${path}` : ''}`; const active = (path: string) => pathname === hrefFor(path)
  const navigation = <>{groups.map(group => <div key={group.label} className="rogeros-nav-group"><p>{group.label}</p>{group.items.map(item => { const Icon = item.icon; return <Link key={item.label} href={hrefFor(item.path)} onClick={() => setMobileOpen(false)} className={active(item.path) ? 'is-active' : ''}><Icon aria-hidden /><span>{item.label}</span>{item.foundation && <small>Next</small>}</Link> })}</div>)}</>

  return <div className="rogeros-app">
    <aside className={`rogeros-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Primary navigation"><div className="rogeros-brand"><span>R</span><div><strong>RogerOS</strong><small>by Green Pixxel</small></div><button className="rogeros-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></button></div><div className="rogeros-project-card"><small>Current project</small><strong>{project.name}</strong><span>{organization}</span></div><nav>{navigation}</nav><div className="rogeros-sidebar-footer"><Link href={`/p/${project.slug}/settings`}><Settings aria-hidden /> Settings</Link><button onClick={() => void signOut({ callbackUrl: '/login' })}><span className="rogeros-account-avatar">{initials}</span><span><strong>{accountLabel}</strong><small>{project.role ? friendlyRole(project.role) : 'Member'}</small></span></button></div></aside>
    {mobileOpen && <button className="rogeros-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <div className="rogeros-main"><header className="rogeros-topbar"><button className="rogeros-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></button><label className="rogeros-project-switcher"><span>Project</span><div><select aria-label="Project switcher" value={project.slug} onChange={event => router.push(`/p/${event.target.value}${suffix ? `/${suffix}` : ''}`)}>{projects.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><ChevronDown aria-hidden /></div></label><button className="rogeros-search-trigger" onClick={() => setCommandOpen(true)}><Search aria-hidden /><span>Search or go to…</span><kbd>⌘ K</kbd></button><div className="rogeros-top-status">{organization}</div><ThemeToggle /><button className="rogeros-top-account" onClick={() => void signOut({ callbackUrl: '/login' })} title="Sign out">{initials}</button></header><main className="rogeros-content">{children}</main></div>
    {commandOpen && <ProjectCommandMenu projectId={project.id} items={allItems} hrefFor={hrefFor} onNavigate={path => { router.push(path); setCommandOpen(false) }} onClose={() => setCommandOpen(false)} />}
  </div>
}

function ProjectCommandMenu({ projectId, items, hrefFor, onNavigate, onClose }: { projectId: string; items: NavItem[]; hrefFor: (path: string) => string; onNavigate: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''); const [results, setResults] = useState<ProjectSearchResult[]>([]); const [error, setError] = useState('')
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) { setResults([]); setError(''); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?projectId=${encodeURIComponent(projectId)}&q=${encodeURIComponent(trimmed)}`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('SEARCH_UNAVAILABLE')
        const data = await response.json() as { results?: ProjectSearchResult[] }
        setResults(data.results ?? []); setError('')
      } catch { if (!controller.signal.aborted) { setResults([]); setError('Search is unavailable.') } }
    }, 150)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [projectId, query])
  const matchingItems = items.filter(item => !query.trim() || item.label.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="rogeros-command-backdrop" role="presentation" onMouseDown={onClose}><div className="rogeros-command" role="dialog" aria-modal="true" aria-label="RogerOS search and command menu" onMouseDown={event => event.stopPropagation()}><header><Command aria-hidden /><div><strong>Search or go to</strong><span>Project records and navigation only</span></div><button aria-label="Close command menu" onClick={onClose}>Esc</button></header><div><label className="sr-only" htmlFor="rogeros-command-query">Search this project</label><input id="rogeros-command-query" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks, workforce, or Project Brain…" maxLength={100} /><p className="rogeros-command-note">Search returns redacted metadata only; it cannot run actions or change records.</p>{matchingItems.map(item => { const Icon = item.icon; return <button key={item.label} onClick={() => onNavigate(hrefFor(item.path))}><Icon aria-hidden /><span>{item.label}</span><small>Go to</small></button> })}{query.trim().length >= 2 && <><p className="rogeros-command-section">Project results</p>{results.map(result => <button key={`${result.kind}-${result.id}`} onClick={() => onNavigate(hrefFor(result.href))}><Search aria-hidden /><span><strong>{result.title}</strong><small>{result.detail}</small></span><small>Go to</small></button>)}{!error && results.length === 0 && <p className="rogeros-command-note">No authorized project records match.</p>}{error && <p className="rogeros-command-note">{error}</p>}</>}</div><footer>Navigation only. No actions, approvals, dispatches, or configuration changes are available here.</footer></div></div>
}

function friendlyRole(role: string) { return role.charAt(0) + role.slice(1).toLowerCase() }
