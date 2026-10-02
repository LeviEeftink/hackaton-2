import Link from 'next/link'

export default function EindPage() {
  return (
    <main className="screen">
      <div className="brand">HitchTracker</div>
      <div className="steps">
        <div className="step active" />
        <div className="step active" />
        <div className="step active" />
        <div className="step active" />
      </div>

      <h1 className="title">Rit afgerond</h1>

      <div className="quote-block">
        <p className="quote-label">Definitieve prijs</p>
        <p className="quote-price">EUR 12,80</p>
      </div>

      <div className="summary-list">
        <div className="summary-row">
          <span>Afstand</span>
          <span>2,6 km</span>
        </div>
        <div className="summary-row">
          <span>Duur</span>
          <span>11 min</span>
        </div>
        <div className="summary-row">
          <span>Schatting</span>
          <span>EUR 12,40</span>
        </div>
      </div>

      <div className="btn-row">
        <Link className="btn" href="/">Nieuwe rit</Link>
      </div>
    </main>
  )
}
