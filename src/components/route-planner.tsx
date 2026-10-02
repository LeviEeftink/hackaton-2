'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { api, distance, minutes, type RouteOption } from '@/lib/client-api'
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
  const selectedRoute = visible.find(route => route.id === selected)
  return <main className="screen">
    <Steps current={1} /><p className="eyebrow">Op weg, met overzicht</p>
    <h1 className="title">Waar wil je naartoe?</h1><p className="subtitle">Kies je route. Je ziet de tijd, afstand en volledige prijsopbouw voordat je vertrekt.</p>
    {activeRide && <p className="notice success">Je hebt een actieve rit. <Link href={`/rit?id=${activeRide}`}>Verder met volgen →</Link></p>}
    <div className="grid"><section>
      <label className="field"><span className="field-label">Zoek vertrek of bestemming</span><input className="field-value" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Bijvoorbeeld Museumplein of Schiphol" /></label>
      <div className="chips" style={{ marginTop: 14 }}><button className={`chip ${!favoritesOnly ? 'selected' : ''}`} onClick={() => setFavoritesOnly(false)}>Alle routes</button><button className={`chip ${favoritesOnly ? 'selected' : ''}`} onClick={() => setFavoritesOnly(true)}>★ Favorieten ({favorites.length})</button></div>
      {loading && <p role="status" className="notice">Routes laden…</p>}
      {error && <div className="notice error" role="alert">{error} <button className="text-button" onClick={() => setAttempt(attempt + 1)}>Opnieuw proberen</button></div>}
      <div className="route-results">{visible.map(route => <div key={route.id} className={`route-option ${selected === route.id ? 'selected' : ''}`}>
        <button className="route-select" onClick={() => setSelected(route.id)} aria-pressed={selected === route.id}>
          <span className="route-dot" aria-hidden="true" /><span><strong>{route.destinationLabel}</strong><small>Vanaf {route.pickupLabel}</small><small>{distance(route.totalDistanceMeters)} · {minutes(route.estimatedDurationSeconds)}</small></span>
        </button>
        <button className={`favorite ${favorites.includes(route.id) ? 'saved' : ''}`} disabled={!storageReady} onClick={() => toggleFavorite(route.id)} aria-label={`${route.destinationLabel} ${favorites.includes(route.id) ? 'verwijderen uit' : 'toevoegen aan'} favorieten`} aria-pressed={favorites.includes(route.id)}>{favorites.includes(route.id) ? '★' : '☆'}</button>
      </div>)}</div>
      {!loading && !error && visible.length === 0 && <p className="empty">{favoritesOnly ? 'Nog geen passende favorieten. Bewaar een route met het sterretje.' : routes.length ? 'Geen route gevonden. Probeer een andere zoekterm.' : 'Er zijn nog geen routes beschikbaar.'}</p>}
      <p className="muted">Je favorieten worden in deze browser bewaard.</p>
    </section><aside className="panel tinted stack">
      <p className="eyebrow">Goed om te weten</p><h2>Een helder begin.<br />Een transparante rit.</h2>
      <p className="muted">Je prijs komt uit het actuele tarief. Tijdens je rit zie je hoeveel je hebt gereden en wat de rit kost.</p>
      <div className="summary-row"><span>01</span><span>Kies een route</span></div><div className="summary-row"><span>02</span><span>Bekijk het voorstel</span></div><div className="summary-row"><span>03</span><span>Volg je rit</span></div>
      <p className="muted">Beschikbare routes zijn demo-routes met een vast vertrekpunt.</p>
    </aside></div>
    <div className="btn-row">{selectedRoute ? <Link className="btn" href={`/voorstel?route=${selectedRoute.id}`}>Bekijk tijd en prijs voor {selectedRoute.destinationLabel} →</Link> : <button className="btn" disabled>Kies een beschikbare route</button>}</div>
  </main>
}
