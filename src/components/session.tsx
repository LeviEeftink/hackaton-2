'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type SessionUser } from '@/lib/client-api'

type Session = { user: SessionUser | null; loading: boolean; refresh: () => Promise<void> }
const SessionContext = createContext<Session>({ user: null, loading: true, refresh: async () => {} })
export const useSession = () => useContext(SessionContext)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  async function refresh() {
    try { setUser((await api<{ user: SessionUser | null }>('/api/users/me')).user) }
    catch { setUser(null) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  return <SessionContext.Provider value={{ user, loading, refresh }}>{children}</SessionContext.Provider>
}

export function Navigation() {
  const { user, refresh } = useSession()
  const path = usePathname()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function logout() {
    setBusy(true); setError('')
    try { await api('/api/users/logout', { method: 'POST' }); await refresh(); window.location.assign('/') }
    catch (e) { setError((e as Error).message); setBusy(false) }
  }
  return <>
    <nav className="navigation" aria-label="Hoofdnavigatie">
      <Link href="/" aria-current={path === '/' ? 'page' : undefined}>Nieuwe rit</Link>
      {user && <Link href="/geschiedenis" aria-current={path === '/geschiedenis' ? 'page' : undefined}>Mijn ritten</Link>}
      {user && user.role !== 'passenger' && <Link href="/chauffeur" aria-current={path === '/chauffeur' ? 'page' : undefined}>Ritbeheer</Link>}
      <div className="nav-account">{user ? <><span>{user.name}</span><button className="text-button" onClick={logout} disabled={busy}>{busy ? 'Bezig…' : 'Uitloggen'}</button></> : <Link href="/account">Inloggen</Link>}</div>
    </nav>
    {error && <p role="alert" className="notice error">{error}</p>}
  </>
}

export function Steps({ current }: { current: number }) {
  return <ol className="steps" aria-label="Ritstappen">{['Bestemming', 'Voorstel', 'Onderweg', 'Ritbewijs'].map((label, index) =>
    <li key={label} className={`step${index < current ? ' active' : ''}`} aria-current={index === current - 1 ? 'step' : undefined}><span className="sr-only">{label}</span></li>,
  )}</ol>
}
