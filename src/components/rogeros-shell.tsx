'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const navigation = [
  ['Command Center', ''], ['Team', 'team'], ['Tasks', 'tasks'], ['Meetings', 'meetings'],
  ['Workforce', 'workforce'], ['Project Brain', 'brain'], ['Workspaces', 'workspaces'],
  ['Market', 'market'], ['Approvals', 'approvals'], ['Reports', 'reports'], ['Automations', 'automations'],
]

export function RogerOSShell({ children, project, projects }: { children: React.ReactNode; project: { name: string; slug: string }; projects: Array<{ name: string; slug: string }> }) {
  const pathname = usePathname(); const router = useRouter()
  const suffix = pathname.split('/').slice(3).join('/')
  return <div className="min-h-screen bg-[#0b0e14] text-slate-100">
    <aside className="fixed inset-y-0 hidden w-64 border-r border-white/10 bg-[#10141d] p-5 md:block">
      <div className="mb-10"><div className="text-xl font-semibold">RogerOS</div><div className="text-xs text-slate-400">by Green Pixxel</div></div>
      <nav className="space-y-1">{navigation.map(([label, path]) => <Link key={label} href={`/p/${project.slug}${path ? `/${path}` : ''}`} className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white">{label}</Link>)}</nav>
      <Link href={`/p/${project.slug}/settings`} className="absolute bottom-6 text-sm text-slate-400 hover:text-white">Settings</Link>
    </aside>
    <main className="md:ml-64"><header className="flex items-center justify-between border-b border-white/10 px-6 py-4"><div><div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current project</div><select aria-label="Project switcher" value={project.slug} onChange={e => router.push(`/p/${e.target.value}${suffix ? `/${suffix}` : ''}`)} className="mt-1 bg-transparent text-lg font-semibold outline-none">{projects.map(p => <option className="bg-slate-900" key={p.slug} value={p.slug}>{p.name}</option>)}</select></div><div className="flex gap-3 text-sm text-slate-400"><button aria-label="Search" className="rounded-md border border-white/10 px-3 py-1.5">Search</button><div className="rounded-full bg-white/10 px-3 py-1.5">Account</div></div></header><section className="mx-auto max-w-6xl p-6">{children}</section></main>
  </div>
}
