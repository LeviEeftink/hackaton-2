'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, type RouteOption } from '@/lib/client-api'
import { Steps, useSession } from './session'

export function RoutePlanner() {
  const { user } = useSession()
  const [routes, setRoutes] = useState<RouteOption[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [activeRideResult, setActiveRide] = useState<{ userId: number; id: number } | null>(null)
  const activeRide = user && activeRideResult?.userId === user.id ? activeRideResult.id : null
  const [favorites, setFavorites] = useState<number[]>([])
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const favoriteKey = `hitchtracker-favorites-${user?.id ?? 'guest'}`
  useEffect(() => {
    setStorageReady(false)
    try {
      const value: unknown = JSON.parse(localStorage.getItem(favoriteKey) || '[]')
      setFavorites(Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [])
    } catch { setFavorites([]) }
    setStorageReady(true)
  }, [favoriteKey])
  function toggleFavorite(id: number) {
    const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id]
    setFavorites(next)
    try { localStorage.setItem(favoriteKey, JSON.stringify(next)) } catch { /* Browsers may disable local storage. */ }
  }
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    api<{ docs: RouteOption[] }>('/api/routes?where[isActive][equals]=true&limit=100&depth=0&sort=name', { signal: controller.signal })
      .then(({ docs }) => { setRoutes(docs); setSelected(docs[0]?.id ?? null) })
      .catch((e: Error) => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])
  useEffect(() => {
    setActiveRide(null)
    if (!user || user.role !== 'passenger') return
    const controller = new AbortController()
    api<{ docs: { id: number }[] }>(`/api/rides?where[status][equals]=active&where[passenger][equals]=${user.id}&limit=1&depth=0&sort=-createdAt`, { signal: controller.signal })
      .then(({ docs }) => { if (!controller.signal.aborted) setActiveRide(docs[0] ? { userId: user.id, id: docs[0].id } : null) }).catch(() => {})
    return () => controller.abort()
  }, [user])
  const visible = routes.filter(route => (!favoritesOnly || favorites.includes(route.id)) && `${route.pickupLabel} ${route.destinationLabel}`.toLocaleLowerCase('nl').includes(search.toLocaleLowerCase('nl')))
  const selectedRoute = visible.find(route => route.id === selected) ?? visible[0]
  return <main className="screen">
    <Steps current={1} />
    <h1 className="title">Waar wil je naartoe?</h1>
    <p className="subtitle">Voer een bestemming in en bekijk direct een indicatie van tijd en prijs.</p>
    {activeRide && <p className="notice">Je hebt een actieve rit. <Link href={`/rit?id=${activeRide}`}>Rit volgen</Link></p>}
    {loading && <p role="status" className="notice">Routes laden…</p>}
    {error && <div className="notice error" role="alert">{error} <button className="text-button" onClick={() => setAttempt(attempt + 1)}>Opnieuw proberen</button></div>}
    <label className="field"><span className="field-label">Vertrek</span><input className="field-value" value={selectedRoute?.pickupLabel ?? ''} placeholder="Selecteer een bestemming" readOnly /></label>
    <label className="field"><span className="field-label">Bestemming</span><select className="field-value" value={selectedRoute?.id ?? ''} onChange={event => setSelected(Number(event.target.value))} disabled={loading || visible.length === 0}>
      {!selectedRoute && <option value="">Geen bestemming beschikbaar</option>}
      {visible.map(route => <option key={route.id} value={route.id}>{route.destinationLabel}</option>)}
    </select></label>
    {selectedRoute && <button className="text-button favorite-toggle" disabled={!storageReady} onClick={() => toggleFavorite(selectedRoute.id)} aria-pressed={favorites.includes(selectedRoute.id)}>{favorites.includes(selectedRoute.id) ? 'Verwijder uit favorieten' : 'Bewaar als favoriet'}</button>}
    <details className="options"><summary>Zoeken en favorieten</summary>
      <label className="field"><span className="field-label">Zoek vertrek of bestemming</span><input className="field-value" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Zoek een bestemming" /></label>
      <div className="chips"><button className={`chip ${!favoritesOnly ? 'selected' : ''}`} aria-pressed={!favoritesOnly} onClick={() => setFavoritesOnly(false)}>Alle routes</button><button className={`chip ${favoritesOnly ? 'selected' : ''}`} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(true)}>Favorieten ({favorites.length})</button></div>
      <p className="muted">Favorieten worden in deze browser bewaard.</p>
    </details>
    {!loading && !error && visible.length === 0 && <p className="notice">{favoritesOnly ? 'Geen favorieten gevonden.' : 'Geen routes gevonden.'}</p>}
    <div className="btn-row">{selectedRoute ? <Link className="btn" href={`/voorstel?route=${selectedRoute.id}`}>Bekijk tijd en prijs</Link> : <button className="btn" disabled>Kies een bestemming</button>}</div>
  </main>
}
