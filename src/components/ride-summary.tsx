'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { api, dateTime, distance, minutes, money, statusLabel, type Tracking } from '@/lib/client-api'
import { Steps, useSession } from './session'

export function RideSummary({ rideId }: { rideId: number }) {
  const { user, loading: sessionLoading } = useSession()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; data?: Tracking; error?: string } | null>(null)
  const validID = Number.isSafeInteger(rideId) && rideId > 0
  const requestKey = `${user?.id ?? 'guest'}:${rideId}:${attempt}`
  const current = result?.key === requestKey ? result : null

  useEffect(() => {
    if (sessionLoading || !user || !validID) return
    const controller = new AbortController()
    api<Tracking>(`/api/rides/${rideId}/tracking`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult({ key: requestKey, data }) })
      .catch((error: Error) => { if (!controller.signal.aborted) setResult({ key: requestKey, error: error.message }) })
    return () => controller.abort()
  }, [user?.id, sessionLoading, rideId, validID, attempt, requestKey])

  const ride = current?.data?.ride
  const completed = ride?.status === 'completed'
  const cancelled = ride?.status === 'cancelled'
  const savedFare = ride?.progress.finalFareCents
  const finalFare = completed && typeof savedFare === 'number' && Number.isSafeInteger(savedFare) && savedFare >= 0 ? savedFare : null
  const difference = ride && finalFare !== null ? finalFare - ride.quotedFareCents : null

  return <main className="screen">
    <Steps current={4} />
    <Link className="back" href="/geschiedenis">← Mijn ritten</Link>
    <p className="eyebrow">{completed ? 'Jouw ritbewijs' : 'Jouw rit'}</p>
    <h1 className="title">{cancelled ? 'Rit geannuleerd.' : completed ? 'Aangekomen. Alles op een rij.' : ride ? 'Deze rit is nog niet afgerond.' : 'Je rit bekijken.'}</h1>

    {!validID ? <div className="notice error" role="alert">Kies een rit in je ritgeschiedenis om het overzicht te bekijken.</div> : sessionLoading ? <p className="notice" role="status">Account controleren…</p> : !user ?
      <section className="panel stack"><h2>Log in om deze rit te bekijken</h2><p className="muted">Je ritgegevens en ritbewijs zijn gekoppeld aan je account.</p><Link className="btn" href={`/account?next=${encodeURIComponent(`/eind?id=${rideId}`)}`}>Inloggen</Link></section> : <>
        {!current && <p className="notice" role="status">Ritgegevens laden…</p>}
        {current?.error && <div className="notice error" role="alert">{current.error} <button type="button" className="text-button" onClick={() => setAttempt(attempt + 1)}>Opnieuw proberen</button></div>}
        {ride && <>
          <p className="subtitle">{completed ? 'Je route, gereden afstand en definitieve prijs bij elkaar.' : cancelled ? 'Bekijk de gegevens die tot de annulering zijn vastgelegd.' : 'Volg de voortgang en bekijk het ritbewijs zodra je rit is afgerond.'}</p>
          <div className="grid">
            <section className="panel">
              <div className="card-heading"><span className="muted">{ride.reference}</span><span className={`badge${cancelled ? ' cancelled' : ''}`}>{statusLabel(ride.status)}</span></div>
              <p className="eyebrow">{ride.pickupLabel}</p><h2>→ {ride.destinationLabel}</h2>
              {completed && finalFare !== null && <div className="quote-block"><p className="quote-label">Definitieve prijs</p><p className="quote-price">{money(finalFare, ride.currency)}</p></div>}
              {completed && finalFare === null && <p className="notice error" role="alert">De definitieve prijs is nog niet beschikbaar. Probeer het overzicht later opnieuw te laden.</p>}
              {cancelled && <p className="notice">Deze rit is geannuleerd. Er is geen definitief ritbewijs beschikbaar.</p>}
              {!completed && !cancelled && <p className="notice">Je rit is {ride.status === 'active' ? 'nog onderweg' : 'nog niet gestart'}. De definitieve prijs volgt na afronding.</p>}
            </section>
            <section className="panel tinted">
              <h2>Ritgegevens</h2>
              <div className="summary-list">
                <div className="summary-row"><span>Gereden afstand</span><span>{distance(ride.progress.drivenDistanceMeters)}</span></div>
                <div className="summary-row"><span>{completed ? 'Ritduur' : 'Verstreken tijd'}</span><span>{minutes(ride.progress.elapsedSeconds)}</span></div>
                <div className="summary-row"><span>Gestart</span><span>{dateTime(ride.startedAt)}</span></div>
                {completed && <div className="summary-row"><span>Afgerond</span><span>{dateTime(ride.completedAt)}</span></div>}
                {completed && <div className="summary-row"><span>Oorspronkelijke schatting</span><span>{money(ride.quotedFareCents, ride.currency)}</span></div>}
              </div>
              {difference !== null && <p className="muted">{difference === 0 ? 'De eindprijs komt overeen met je oorspronkelijke schatting.' : `${money(Math.abs(difference), ride.currency)} ${difference > 0 ? 'meer' : 'minder'} dan je oorspronkelijke schatting.`}</p>}
              {completed && <p className="muted">Het ritbewijs gebruikt de vastgelegde eindprijs en het tarief van deze rit. Download het CSV-bestand om je gegevens te bewaren.</p>}
            </section>
          </div>
          <div className="btn-row">
            {!completed && !cancelled && <Link className="btn" href={`/rit?id=${ride.id}`}>Verder met rit volgen →</Link>}
            {completed && finalFare !== null && <><a className="btn" href={`/api/rides/${ride.id}/receipt`}>Download ritbewijs (CSV)</a><button type="button" className="btn btn-outline" onClick={() => window.print()}>Ritoverzicht afdrukken</button></>}
            <Link className={`btn${completed && finalFare !== null ? ' btn-outline' : ''}`} href="/">Nieuwe rit plannen</Link>
          </div>
        </>}
      </>}
  </main>
}
