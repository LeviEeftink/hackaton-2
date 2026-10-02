'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { api, distance, money } from '@/lib/client-api'

import { useSession } from './session'

type ActiveRide = {
  id: number
  reference: string
  journey: { pickupLabel: string; destinationLabel: string }
  tariffSnapshot: { currency: string }
  progress: {
    drivenDistanceMeters: number
    progressPercent: number
    currentFareCents: number
    estimatedFinalFareCents: number
  }
}

type ActiveRides = { docs: ActiveRide[]; totalDocs: number; hasNextPage?: boolean }
type DashboardResult = ActiveRides & { userId: number; role: string }

export function DriverDashboard() {
  const { user, loading: sessionLoading } = useSession()
  const [result, setResult] = useState<DashboardResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const userId = user?.id
  const role = user?.role
  const canManage = Boolean(user && role !== 'passenger')

  useEffect(() => {
    if (sessionLoading || !userId || !role || role === 'passenger') {
      setResult(null)
      setError('')
      setPending(false)
      return
    }
    const controller = new AbortController()
    setPending(true)
    setError('')
    api<ActiveRides>('/api/rides?where[status][equals]=active&limit=100&depth=0&sort=-createdAt', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ ...data, userId, role })
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false)
      })
    return () => controller.abort()
  }, [sessionLoading, userId, role, attempt])

  // Results belong to the session that fetched them, including its permissions.
  const rides = result && result.userId === userId && result.role === role ? result : null

  return <main className="screen">
    <p className="eyebrow">Ritbeheer</p>
    <h1 className="title">Klaar voor de volgende rit.</h1>
    <p className="subtitle">{role === 'driver' ? 'Bekijk jouw toegewezen actieve ritten en werk onderweg de voortgang bij.' : 'Bekijk actieve ritten en open een rit om de voortgang te beheren.'}</p>

    {sessionLoading ? <p className="notice" role="status">Account controleren…</p> : !user ? <section className="panel stack">
      <h2>Log in als chauffeur of medewerker</h2>
      <p className="muted">Je account bepaalt welke ritten je kunt bekijken en bijwerken.</p>
      <Link className="btn" href="/account?next=%2Fchauffeur">Inloggen</Link>
    </section> : !canManage ? <section className="panel stack">
      <h2>Bekijk je rit als passagier</h2>
      <p className="muted">Ritbeheer is beschikbaar voor chauffeurs en medewerkers. Volg je eigen rit via Mijn ritten of start een nieuwe rit.</p>
      <Link className="btn" href="/geschiedenis">Mijn ritten</Link>
      <Link className="btn btn-outline" href="/">Nieuwe rit</Link>
    </section> : <div className="stack">
      <section className="panel tinted">
        <h2>Van boeking naar vertrek</h2>
        <p className="muted">Een passagier start de rit vanuit het ritvoorstel. Een medewerker wijst daarna in het beheer een chauffeur toe. Chauffeurs zien hier hun toegewezen ritten; medewerkers kunnen alle actieve ritten openen en voortgang bijwerken.</p>
        {(role === 'operator' || role === 'admin') && <Link className="text-button" href="/admin/collections/rides">Chauffeur toewijzen in beheer</Link>}
      </section>

      <div className="card-heading">
        <h2>{role === 'driver' ? 'Mijn actieve ritten' : 'Actieve ritten'}{rides ? ` (${rides.totalDocs})` : ''}</h2>
        <button className="text-button" onClick={() => setAttempt((current) => current + 1)} disabled={pending}>{pending ? 'Verversen…' : 'Verversen'}</button>
      </div>
      {error && <div className="notice error" role="alert">{error} <button className="text-button" onClick={() => setAttempt((current) => current + 1)} disabled={pending}>Opnieuw proberen</button></div>}
      {!rides && !error && <p className="notice" role="status">Actieve ritten ophalen…</p>}
      {rides && rides.docs.length === 0 && <div className="empty">
        <h2>Er staan geen actieve ritten klaar</h2>
        <p>{role === 'driver' ? 'Zodra een medewerker een actieve rit aan je toewijst, verschijnt die hier. Ververs om nieuwe opdrachten op te halen.' : 'Laat een passagier eerst een rit starten. Ververs daarna om de boeking te bekijken.'}</p>
      </div>}
      {rides && rides.docs.length > 0 && <section className="stack" aria-label="Actieve ritten" aria-busy={pending}>
        {rides.docs.map((ride) => {
          const progress = Math.min(100, Math.max(0, ride.progress.progressPercent))
          const currency = ride.tariffSnapshot.currency
          return <Link key={ride.id} href={`/rit?id=${ride.id}`} className="panel history-card" aria-label={`Open rit ${ride.reference}: ${ride.journey.pickupLabel} naar ${ride.journey.destinationLabel}`}>
            <div className="card-heading"><span className="eyebrow">{ride.reference}</span><span className="badge">Onderweg</span></div>
            <h2>{ride.journey.pickupLabel} → {ride.journey.destinationLabel}</h2>
            <div className="progress" role="progressbar" aria-label="Ritvoortgang" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-labels"><span>{progress}% bereikt</span><span>{distance(ride.progress.drivenDistanceMeters)} gereden</span></div>
            <div className="summary-row"><span>Huidige prijs</span><strong>{money(ride.progress.currentFareCents, currency)}</strong></div>
            <div className="summary-row"><span>Geschatte eindprijs</span><strong>{money(ride.progress.estimatedFinalFareCents, currency)}</strong></div>
            <p className="muted">Open rit en werk de voortgang bij →</p>
          </Link>
        })}
      </section>}
      {rides?.hasNextPage && <p className="notice">De 100 nieuwste actieve ritten worden getoond. Gebruik het beheer om alle ritten te bekijken.</p>}
    </div>}
  </main>
}
