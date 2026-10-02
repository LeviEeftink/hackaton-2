'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { api, dateTime, distance, minutes, money, statusLabel, type TrackedRide } from '@/lib/client-api'
import { useSession } from './session'

type HistoryRide = Omit<TrackedRide, 'progress'> & {
  createdAt: string
  cancelledAt?: string | null
  progress: Omit<TrackedRide['progress'], 'lastRouteSequence'>
}

type HistoryResponse = {
  docs: HistoryRide[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
  nextPage: number | null
  prevPage: number | null
}

type Filter = '' | TrackedRide['status']
const filters: Array<{ value: Filter; label: string }> = [
  { value: '', label: 'Alle ritten' },
  { value: 'active', label: 'Onderweg' },
  { value: 'completed', label: 'Afgerond' },
  { value: 'cancelled', label: 'Geannuleerd' },
  { value: 'quoted', label: 'Voorstellen' },
]

const priceLabel = (ride: HistoryRide): string => {
  if (ride.status === 'cancelled') return 'Geen definitief ritbewijs'
  if (ride.status === 'completed') {
    const finalFare = ride.progress.finalFareCents
    return typeof finalFare === 'number' && Number.isSafeInteger(finalFare) && finalFare >= 0
      ? `Eindprijs ${money(finalFare, ride.currency)}`
      : 'Eindprijs niet beschikbaar'
  }
  return ride.status === 'active'
    ? `Actuele prijs ${money(ride.progress.currentFareCents, ride.currency)}`
    : `Geschatte prijs ${money(ride.quotedFareCents, ride.currency)}`
}

export function History() {
  const { user, loading: sessionLoading } = useSession()
  const [status, setStatus] = useState<Filter>('')
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: HistoryResponse; error?: string } | null>(null)
  const requestKey = `${user?.id ?? 'guest'}:${status}:${page}:${attempt}`
  const current = result?.key === requestKey ? result : null

  useEffect(() => {
    if (sessionLoading || !user) return
    const controller = new AbortController()
    const query = new URLSearchParams({ page: String(page), limit: '10' })
    if (status) query.set('status', status)
    api<HistoryResponse>(`/api/rides/history?${query}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult({ key: requestKey, data }) })
      .catch((error: Error) => { if (!controller.signal.aborted) setResult({ key: requestKey, error: error.message }) })
    return () => controller.abort()
  }, [user?.id, sessionLoading, status, page, attempt, requestKey])

  const data = current?.data
  return <main className="screen">
    <h1 className="title">Mijn ritten</h1>

    {sessionLoading ? <p className="notice" role="status">Account controleren…</p> : !user ?
      <section className="panel stack"><h2>Log in om je ritten te bekijken</h2><Link className="btn" href="/account?next=%2Fgeschiedenis">Inloggen</Link></section> : <>
        <div className="chips" aria-label="Filter op ritstatus">
          {filters.map((filter) => <button key={filter.value} type="button" className={`chip${status === filter.value ? ' selected' : ''}`} aria-pressed={status === filter.value} onClick={() => { setStatus(filter.value); setPage(1) }}>{filter.label}</button>)}
        </div>

        {!current && <p className="notice" role="status">Je ritten laden…</p>}
        {current?.error && <div className="notice error" role="alert">{current.error} <button type="button" className="text-button" onClick={() => setAttempt(attempt + 1)}>Opnieuw proberen</button></div>}
        {data && <>
          <p className="muted" role="status">{data.totalDocs} {data.totalDocs === 1 ? 'rit' : 'ritten'}{status ? ` · ${filters.find((filter) => filter.value === status)?.label}` : ''}</p>
          {data.docs.length === 0 ? <section className="empty"><h2>{status ? 'Geen ritten met deze status' : 'Nog geen ritten'}</h2>{status && <p>Kies een andere filter.</p>}<Link href="/">Nieuwe rit plannen</Link></section> :
            <div className="stack">{data.docs.map((ride) => <Link key={ride.id} className="panel history-card" href={`${ride.status === 'completed' || ride.status === 'cancelled' ? '/eind' : '/rit'}?id=${ride.id}`}>
              <div className="card-heading"><span className="muted">{ride.reference}</span><span className={`badge${ride.status === 'cancelled' ? ' cancelled' : ''}`}>{statusLabel(ride.status)}</span></div>
              <strong>{ride.pickupLabel} → {ride.destinationLabel}</strong>
              <p className="muted">{dateTime(ride.completedAt || ride.cancelledAt || ride.startedAt || ride.createdAt)}</p>
              <p className="muted">{distance(ride.progress.drivenDistanceMeters)} · {minutes(ride.progress.elapsedSeconds)}</p>
              <p>{priceLabel(ride)}</p>
              <p className="muted">{ride.status === 'active' || ride.status === 'quoted' ? 'Rit volgen' : 'Rit bekijken'}</p>
            </Link>)}</div>}
          {data.totalPages > 1 && <nav className="pagination" aria-label="Pagina’s van ritgeschiedenis">
            <button type="button" className="btn btn-outline" disabled={!data.hasPrevPage} onClick={() => setPage(data.prevPage ?? Math.max(1, page - 1))}>Vorige</button>
            <span>Pagina {data.page} van {data.totalPages}</span>
            <button type="button" className="btn btn-outline" disabled={!data.hasNextPage} onClick={() => setPage(data.nextPage ?? page + 1)}>Volgende</button>
          </nav>}
        </>}
        <div className="btn-row"><Link className="btn btn-outline" href="/">Nieuwe rit plannen</Link></div>
      </>}
  </main>
}
