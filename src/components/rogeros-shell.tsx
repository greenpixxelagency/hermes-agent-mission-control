'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { Activity, AppWindow, Bot, Brain, CheckCircle2, ChevronDown, Command, FileBarChart, LayoutDashboard, Menu, Search, Settings, ShieldCheck, Sparkles, Users, X } from 'lucide-react'

type ShellProject = { name: string; slug: string; role?: string }
type NavItem = { label: string; path: string; icon: typeof LayoutDashboard; foundation?: boolean }
const groups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Work', items: [{ label: 'Command Center', path: '', icon: LayoutDashboard }, { label: 'Team', path: 'team', icon: Users }, { label: 'Tasks', path: 'tasks', icon: CheckCircle2 }] },
  { label: 'Company', items: [{ label: 'Workforce', path: 'workforce', icon: Bot }, { label: 'Project Brain', path: 'brain', icon: Brain }, { label: 'Tools', path: 'tools', icon: AppWindow }, { label: 'Market', path: 'market', icon: Sparkles, foundation: true }] },
  { label: 'Control', items: [{ label: 'Approvals', path: 'approvals', icon: ShieldCheck }, { label: 'Reports', path: 'reports', icon: FileBarChart, foundation: true }, { label: 'Automations', path: 'automations', icon: Activity, foundation: true }] },
]

export function RogerOSShell({ children, project, projects, organization, accountLabel }: { children: React.ReactNode; project: ShellProject; projects: ShellProject[]; organization: string; accountLabel: string }) {
  const pathname = usePathname(); const router = useRouter(); const [mobileOpen, setMobileOpen] = useState(false); const [commandOpen, setCommandOpen] = useState(false)
  const suffix = pathname.split('/').slice(3).join('/'); const allItems = useMemo(() => groups.flatMap(group => group.items), []); const initials = accountLabel.slice(0, 2).toUpperCase()
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(value => !value) } if (event.key === 'Escape') { setCommandOpen(false); setMobileOpen(false) } }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [])
  const hrefFor = (path: string) => `/p/${project.slug}${path ? `/${path}` : ''}`; const active = (path: string) => pathname === hrefFor(path)
  const navigation = <>{groups.map(group => <div key={group.label} className="rogeros-nav-group"><p>{group.label}</p>{group.items.map(item => { const Icon = item.icon; return <Link key={item.label} href={hrefFor(item.path)} onClick={() => setMobileOpen(false)} className={active(item.path) ? 'is-active' : ''}><Icon aria-hidden /><span>{item.label}</span>{item.foundation && <small>Next</small>}</Link> })}</div>)}</>

  return <div className="rogeros-app">
    <aside className={`rogeros-sidebar ${mobileOpen ? 'is-open' : ''}`} aria-label="Primary navigation"><div className="rogeros-brand"><span>R</span><div><strong>RogerOS</strong><small>by Green Pixxel</small></div><button className="rogeros-mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X /></button></div><div className="rogeros-project-card"><small>Current project</small><strong>{project.name}</strong><span>{organization}</span></div><nav>{navigation}</nav><div className="rogeros-sidebar-footer"><Link href={`/p/${project.slug}/settings`}><Settings aria-hidden /> Settings</Link><button onClick={() => void signOut({ callbackUrl: '/login' })}><span className="rogeros-account-avatar">{initials}</span><span><strong>{accountLabel}</strong><small>{project.role ? friendlyRole(project.role) : 'Member'}</small></span></button></div></aside>
    {mobileOpen && <button className="rogeros-sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    <div className="rogeros-main"><header className="rogeros-topbar"><button className="rogeros-menu-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu /></button><label className="rogeros-project-switcher"><span>Project</span><div><select aria-label="Project switcher" value={project.slug} onChange={event => router.push(`/p/${event.target.value}${suffix ? `/${suffix}` : ''}`)}>{projects.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select><ChevronDown aria-hidden /></div></label><button className="rogeros-search-trigger" onClick={() => setCommandOpen(true)}><Search aria-hidden /><span>Search or go to…</span><kbd>⌘ K</kbd></button><div className="rogeros-top-status">{organization}</div><button className="rogeros-top-account" onClick={() => void signOut({ callbackUrl: '/login' })} title="Sign out">{initials}</button></header><main className="rogeros-content">{children}</main></div>
    {commandOpen && <div className="rogeros-command-backdrop" role="presentation" onMouseDown={() => setCommandOpen(false)}><div className="rogeros-command" role="dialog" aria-modal="true" aria-label="RogerOS command menu" onMouseDown={event => event.stopPropagation()}><header><Command aria-hidden /><div><strong>Go anywhere in RogerOS</strong><span>Navigation commands available now</span></div><kbd>Esc</kbd></header><div>{allItems.map(item => { const Icon = item.icon; return <button key={item.label} onClick={() => { router.push(hrefFor(item.path)); setCommandOpen(false) }}><Icon aria-hidden /><span>{item.label}</span>{item.foundation && <small>Foundation</small>}</button> })}</div><footer>Project-wide search will arrive in a future milestone.</footer></div></div>}
  </div>
}

function friendlyRole(role: string) { return role.charAt(0) + role.slice(1).toLowerCase() }
