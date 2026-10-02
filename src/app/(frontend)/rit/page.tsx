import Link from 'next/link'

export default function RitPage() {
  return (
    <main className="screen">
      <div className="brand">HitchTracker</div>
      <div className="steps">
        <div className="step active" />
        <div className="step active" />
        <div className="step active" />
        <div className="step" />
      </div>

      <h1 className="title">Naar: Museumplein</h1>
      <p>
        <span className="badge">Bezig</span>
      </p>

      <div>
        <div className="progress">
          <div className="progress-fill" style={{ width: '58%' }} />
          <div className="progress-rest" />
        </div>
        <div className="progress-labels">
          <span>Gereden</span>
          <span>1,5 km gereden</span>
        </div>
      </div>

      <div className="price-list">
        <div className="price-row">
          <span className="price-row-label">Huidige prijs</span>
          <span className="price-row-value">EUR 9,10</span>
        </div>
        <div className="price-row">
          <span className="price-row-label">Eindprijs ca.</span>
          <span className="price-row-value small">EUR 12,40</span>
        </div>
      </div>

      <div className="btn-row">
        <Link className="btn" href="/eind">Rit afronden</Link>
      </div>
    </main>
  )
}
