'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { api, distance, minutes, money, type Quote as QuoteData } from '@/lib/client-api'
import { Steps, useSession } from './session'

export function Quote({ routeId }: { routeId: number }) {
  const { user, loading: sessionLoading } = useSession()
  const router = useRouter()
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const key = useRef<string | null>(null)
  const starting = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    setQuote(null); setError('')
    if (!Number.isSafeInteger(routeId) || routeId <= 0) { setError('Kies eerst een route op de startpagina.'); return }
    api<QuoteData>('/api/routes/quote', { method: 'POST', body: JSON.stringify({ routeId }), signal: controller.signal })
      .then(setQuote).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [routeId, attempt])
  async function start() {
    if (starting.current) return
    starting.current = true
    setBusy(true); setError(''); key.current ??= crypto.randomUUID()
    try {
      const result = await api<{ ride: { id: number } }>('/api/rides/start', { method: 'POST', body: JSON.stringify({ routeId, idempotencyKey: key.current }) })
      router.push(`/rit?id=${result.ride.id}`)
    } catch (e) { setError((e as Error).message); setBusy(false); starting.current = false }
  }
  return <main className="screen"><Steps current={2} /><Link className="back" href="/">← Andere route kiezen</Link>
    <p className="eyebrow">Jouw ritvoorstel</p><h1 className="title">Weet waar je aan toe bent.</h1>
    <p className="subtitle">Een indicatie op basis van jouw route en het actuele tarief.</p>
    {error && <div role="alert" className="notice error">{error} {!quote && <button className="text-button" onClick={() => setAttempt(attempt + 1)}>Opnieuw proberen</button>}</div>}
    {!quote && !error && <p className="notice" role="status">Prijsvoorstel berekenen…</p>}
    {quote && <div className="grid"><section className="panel">
      <p className="eyebrow">{quote.route.pickupLabel}</p><h2>→ {quote.route.destinationLabel}</h2>
      <p className="route-meta">{distance(quote.route.totalDistanceMeters)} · {minutes(quote.route.estimatedDurationSeconds)}</p>
      <div className="quote-block"><p className="quote-label">Geschatte totaalprijs</p><p className="quote-price">{money(quote.quote.totalFareCents, quote.tariff.currency)}</p></div>
      <span className="badge">Tarief vastgelegd bij vertrek</span>
    </section><section className="panel tinted"><h2>Zo is je prijs opgebouwd</h2>
      <div className="price-list"><div className="price-row"><span>Starttarief</span><strong>{money(quote.quote.totalFareCents - quote.quote.distanceFareCents - quote.quote.durationFareCents, quote.tariff.currency)}</strong></div><div className="price-row"><span>Afstand · {distance(quote.route.totalDistanceMeters)}</span><strong>{money(quote.quote.distanceFareCents, quote.tariff.currency)}</strong></div><div className="price-row"><span>Tijd · {minutes(quote.route.estimatedDurationSeconds)}</span><strong>{money(quote.quote.durationFareCents, quote.tariff.currency)}</strong></div></div>
      <p className="muted">De server berekent alle bedragen. Je volgt de voortgang tijdens de rit.</p>
    </section></div>}
    {quote && <div className="btn-row">{sessionLoading ? <button className="btn" disabled>Account controleren…</button> : !user ? <Link className="btn" href={`/account?next=${encodeURIComponent(`/voorstel?route=${routeId}`)}`}>Inloggen om je rit te starten →</Link> : user.role === 'passenger' ? <button className="btn" onClick={start} disabled={busy}>{busy ? 'Je rit wordt gestart…' : 'Start mijn rit →'}</button> : <p className="notice">Log in met een passagiersaccount om een rit te starten.</p>}</div>}
  </main>
}
