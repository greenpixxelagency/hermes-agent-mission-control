'use client'

import { FormEvent, useState } from 'react'

export default function LocalGoogleOAuthSetup() {
  const [secret, setSecret] = useState('')
  const [message, setMessage] = useState('')
  const save = async (event: FormEvent) => {
    event.preventDefault()
    const response = await fetch('/api/auth/local-google-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientSecret: secret }) })
    setSecret('')
    setMessage(response.ok ? 'Google sign-in is configured. Restarting RogerOS…' : 'The Google secret could not be saved.')
    if (response.ok) window.setTimeout(() => window.location.assign('/login'), 600)
  }
  return <main className="rogeros-entry"><div className="panel w-full max-w-sm p-8"><p className="eyebrow">Local setup</p><h1 className="mt-3 text-xl font-semibold">Connect Google sign-in</h1><p className="mt-2 text-sm text-[var(--ros-muted)]">This one-time local step stores the new Google secret on this computer only.</p><form onSubmit={save} className="mt-6 space-y-3"><label className="block text-sm">Google client secret<input required type="password" value={secret} onChange={event => setSecret(event.target.value)} autoComplete="off" className="mt-2 w-full rounded border border-[var(--ros-line)] bg-transparent p-3 text-sm" /></label><button className="btn-primary w-full py-3 text-sm">Save Google sign-in</button></form>{message && <p className="mt-3 text-sm" role="status">{message}</p>}</div></main>
}
