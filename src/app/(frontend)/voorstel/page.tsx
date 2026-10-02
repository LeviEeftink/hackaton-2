import Link from 'next/link'

export default function VoorstelPage() {
  return (
    <main className="screen">
      <div className="brand">HitchTracker</div>
      <div className="steps">
        <div className="step active" />
        <div className="step active" />
        <div className="step" />
        <div className="step" />
      </div>
      <Link className="back" href="/">Terug</Link>

      <div className="route-card">
        <p className="route-from">Amsterdam Centraal</p>
        <p className="route-meta">2,4 km &middot; 9 min</p>
      </div>

      <div className="quote-block">
        <p className="quote-label">Geschatte prijs</p>
        <p className="quote-price">EUR 12,40</p>
      </div>

      <div className="btn-row">
        <Link className="btn" href="/rit">Start rit</Link>
      </div>
    </main>
  )
}
