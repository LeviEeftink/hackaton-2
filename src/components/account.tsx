'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { useSession } from './session'
import { api } from '@/lib/client-api'
import { safeReturnPath } from '@/domain/navigation'

export function Account({ next }: { next: string | string[] }) {
  const { user, refresh } = useSession()
  const router = useRouter()
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const destination = safeReturnPath(next)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    try {
      if (register) await api('/api/users', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email, password }) })
      await api('/api/users/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      await refresh(); router.push(destination)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  return <main className="screen narrow">
    <h1 className="title">{register ? 'Account maken' : 'Inloggen'}</h1>
    {user ? <div className="panel"><p>Je bent ingelogd als <strong>{user.name}</strong>.</p><Link className="btn" href={destination}>Verder</Link></div> : <>
      <form onSubmit={submit} className="stack">
        {register && <label className="field"><span className="field-label">Naam</span><input className="field-value" name="name" autoComplete="name" minLength={2} maxLength={120} required /></label>}
        <label className="field"><span className="field-label">E-mailadres</span><input className="field-value" name="email" type="email" autoComplete="email" required /></label>
        <label className="field"><span className="field-label">Wachtwoord</span><input className="field-value" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 8 : undefined} required /></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Even geduld…' : register ? 'Account maken' : 'Inloggen'}</button>
      </form>
      <button className="text-button account-switch" onClick={() => { setRegister(!register); setError('') }}>{register ? 'Al een account? Inloggen' : 'Account maken'}</button>
    </>}
  </main>
}
