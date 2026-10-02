'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { api, distance, minutes, money, statusLabel, type Tracking } from '@/lib/client-api'
import { Steps, useSession } from './session'

export function RideTracker({ rideId }: { rideId: number }) {
  const { user, loading } = useSession()
  const router = useRouter()
  const [tracking, setTracking] = useState<Tracking | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const actionKeys = useRef<Record<string, string>>({})
  const inFlight = useRef(false)
  useEffect(() => {
    if (!user || !Number.isSafeInteger(rideId) || rideId <= 0) return
    const controller = new AbortController()
    let running = false
    async function load() {
      if (running) return
      running = true
      try {
        const result = await api<Tracking>(`/api/rides/${rideId}/tracking`, { signal: controller.signal })
        if (controller.signal.aborted) return
        setTracking(result); setError('')
        if (result.ride.status === 'completed' || result.ride.status === 'cancelled') router.replace(`/eind?id=${rideId}`)
      } catch (e) { if (!controller.signal.aborted) setError((e as Error).message) }
      finally { running = false }
    }
    void load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 5000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [user, rideId, refresh, router])
  const ride = tracking?.ride
  const nextPoint = tracking?.routePoints.find(point => !point.passed)
  const canOperate = user && ['driver', 'operator', 'admin'].includes(user.role)
  async function act(action: 'advance' | 'complete' | 'cancel') {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setError('')
    const operation = `${action}-${action === 'advance' ? nextPoint?.id : rideId}`
    actionKeys.current[operation] ??= crypto.randomUUID()
    try {
      await api(`/api/rides/${rideId}/${action}`, { method: 'POST', body: JSON.stringify({ idempotencyKey: actionKeys.current[operation], ...(action === 'advance' ? { routePointId: nextPoint?.id } : {}), ...(action === 'cancel' ? { reason } : {}) }) })
      delete actionKeys.current[operation]
      if (action === 'complete' || action === 'cancel') router.replace(`/eind?id=${rideId}`)
      else setRefresh(value => value + 1)
    } catch (e) { setError((e as Error).message) }
    finally { inFlight.current = false; setBusy(false) }
  }
  return <main className="screen"><Steps current={3} />
    <p className="eyebrow">Inzicht onderweg</p><h1 className="title">{ride ? `Naar ${ride.destinationLabel}` : 'Volg je rit.'}</h1>
    <p className="subtitle">Je voortgang en prijs worden elke vijf seconden bijgewerkt.</p>
    {loading ? <p className="notice" role="status">Account controleren…</p> : !user ? <Link className="btn" href={`/account?next=${encodeURIComponent(`/rit?id=${rideId}`)}`}>Inloggen om deze rit te volgen</Link> : !Number.isSafeInteger(rideId) || rideId <= 0 ? <p className="notice error" role="alert">Kies een rit via <Link href="/geschiedenis">Mijn ritten</Link>.</p> : !tracking && !error ? <p className="notice" role="status">Ritgegevens laden…</p> : null}
    {error && <div className="notice error" role="alert">{error} <button className="text-button" onClick={() => setRefresh(value => value + 1)}>Opnieuw laden</button></div>}
    {tracking && ride && <>
      <div className="card-heading"><span className={`badge ${ride.status}`}>{statusLabel(ride.status)}</span><span className="muted">{ride.reference}</span></div>
      <div className="grid"><section className="panel tinted">
        <p className="quote-label">Huidige ritprijs</p><p className="quote-price" aria-live="polite">{money(ride.progress.currentFareCents, ride.currency)}</p>
        <div className="progress" role="progressbar" aria-label="Ritvoortgang" aria-valuenow={ride.progress.progressPercent} aria-valuemin={0} aria-valuemax={100}><div className="progress-fill" style={{ width: `${ride.progress.progressPercent}%` }} /></div>
        <div className="progress-labels"><span>{distance(ride.progress.drivenDistanceMeters)} gereden</span><span>{Math.round(ride.progress.progressPercent)}%</span></div>
        <div className="summary-list"><div className="summary-row"><span>Geschatte eindprijs</span><span>{money(ride.progress.estimatedFinalFareCents, ride.currency)}</span></div><div className="summary-row"><span>Rittijd</span><span>{minutes(ride.progress.elapsedSeconds)}</span></div><div className="summary-row"><span>Volgend routepunt</span><span>{nextPoint?.label ?? 'Bestemming bereikt'}</span></div></div>
        <button className="text-button" onClick={() => setRefresh(value => value + 1)}>Nu verversen</button>
      </section><section className="panel"><h2>Je route</h2><ol className="timeline">{tracking.routePoints.map(point => <li key={point.id} className={point.passed ? 'passed' : ''}><strong>{point.label}</strong><small>{distance(point.distanceFromStartMeters)} vanaf vertrek{point.passed ? ' · Gepasseerd' : ''}</small></li>)}</ol></section></div>
      {ride.status === 'active' && <div className="btn-row">
        {canOperate && (nextPoint ? <button className="btn" onClick={() => act('advance')} disabled={busy}>Routepunt bereikt: {nextPoint.label}</button> : <button className="btn" onClick={() => act('complete')} disabled={busy}>Rit afronden →</button>)}
        {!canOperate && <p className="notice">Je chauffeur verwerkt de routepunten en rondt je rit bij aankomst af.</p>}
        {cancelOpen ? <div className="panel stack"><label className="field"><span className="field-label">Reden voor annulering (optioneel)</span><textarea className="field-value" rows={3} maxLength={250} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="btn btn-danger" onClick={() => act('cancel')} disabled={busy}>{busy ? 'Bezig…' : 'Annulering bevestigen'}</button><button className="text-button" onClick={() => setCancelOpen(false)} disabled={busy}>Rit behouden</button></div> : <button className="text-button" onClick={() => setCancelOpen(true)} disabled={busy}>Rit annuleren</button>}
      </div>}
    </>}
  </main>
}
