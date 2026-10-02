import Link from 'next/link'

import { bestemmingen } from './data/bestemmingen'

export default function StartPage() {
  return (
    <main className="screen">
      <div className="brand">HitchTracker</div>
      <div className="steps">
        <div className="step active" />
        <div className="step" />
        <div className="step" />
        <div className="step" />
      </div>
      <h1 className="title">Waar wil je naartoe?</h1>
      <p className="subtitle">Voer een bestemming in en bekijk direct een indicatie van tijd en prijs.</p>

      <div className="field">
        <label className="field-label" htmlFor="vertrek">Vertrek</label>
        <input className="field-value" id="vertrek" name="vertrek" type="text" defaultValue="Huidige locatie" />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="bestemming">Bestemming</label>
        <select className="field-value" id="bestemming" name="bestemming" defaultValue="Museumplein">
          {bestemmingen.map((bestemming) => (
            <option key={bestemming} value={bestemming}>{bestemming}</option>
          ))}
        </select>
      </div>

      <div className="btn-row">
        <Link className="btn" href="/voorstel">Bekijk tijd en prijs</Link>
      </div>
    </main>
  )
}
