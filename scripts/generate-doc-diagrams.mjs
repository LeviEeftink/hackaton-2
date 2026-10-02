import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const outDir = path.resolve('docs/ontwerp/diagrams')
await fs.mkdir(outDir, { recursive: true })

const C = {
  ink: '#172033',
  muted: '#5B6578',
  line: '#B8C3D6',
  blue: '#17365D',
  lightBlue: '#E8F1FF',
  green: '#227C65',
  lightGreen: '#E9F7F1',
  orange: '#B86722',
  lightOrange: '#FFF0E2',
  red: '#B44545',
  lightRed: '#FFF0F0',
  purple: '#5D4C9A',
  lightPurple: '#F0EDFF',
  gray: '#F6F8FB',
  white: '#FFFFFF',
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function wrap(text, max = 24) {
  const words = String(text).split(/\s+/)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function textBlock(text, x, y, width, opts = {}) {
  const size = opts.size ?? 28
  const weight = opts.weight ?? 500
  const color = opts.color ?? C.ink
  const anchor = opts.anchor ?? 'middle'
  const lines = Array.isArray(text) ? text : wrap(text, opts.maxChars ?? Math.max(12, Math.floor(width / (size * 0.48))))
  const lineHeight = opts.lineHeight ?? Math.round(size * 1.22)
  const startY = y - ((lines.length - 1) * lineHeight) / 2
  return lines
    .map((line, i) => `<text x="${x}" y="${startY + i * lineHeight}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(line)}</text>`)
    .join('')
}

function box(x, y, w, h, title, lines = [], opts = {}) {
  const fill = opts.fill ?? C.white
  const stroke = opts.stroke ?? C.blue
  const titleSize = opts.titleSize ?? 30
  const bodySize = opts.bodySize ?? 23
  const r = opts.r ?? 18
  const titleY = y + (lines.length ? 36 : h / 2 + titleSize / 3)
  const body = lines.length
    ? lines.map((line, i) => `<text x="${x + 28}" y="${y + 76 + i * 29}" font-size="${bodySize}" fill="${opts.bodyColor ?? C.muted}">${esc(line)}</text>`).join('')
    : ''
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${opts.strokeWidth ?? 3}"/>
  <text x="${x + w / 2}" y="${titleY}" text-anchor="middle" font-size="${titleSize}" font-weight="700" fill="${opts.titleColor ?? C.ink}">${esc(title)}</text>
  ${body}`
}

function arrow(x1, y1, x2, y2, label = '', color = C.blue) {
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2
  const labelSvg = label ? `<text x="${midX}" y="${midY - 12}" text-anchor="middle" font-size="20" font-weight="600" fill="${color}">${esc(label)}</text>` : ''
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="4" marker-end="url(#arrow)"/>${labelSvg}`
}

function diamond(cx, cy, w, h, text, opts = {}) {
  const points = `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`
  return `<polygon points="${points}" fill="${opts.fill ?? C.lightOrange}" stroke="${opts.stroke ?? C.orange}" stroke-width="3"/>${textBlock(text, cx, cy + 8, w * 0.72, { size: opts.size ?? 24, weight: 700, maxChars: 14 })}`
}

function header(title, subtitle, width) {
  return `
    <text x="${width / 2}" y="58" text-anchor="middle" font-size="42" font-weight="800" fill="${C.ink}">${esc(title)}</text>
    <text x="${width / 2}" y="94" text-anchor="middle" font-size="24" fill="${C.muted}">${esc(subtitle)}</text>`
}

function svg(width, height, title, subtitle, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
      <path d="M2,2 L10,6 L2,10 Z" fill="${C.blue}"/>
    </marker>
    <style>
      text { font-family: "Segoe UI", Arial, sans-serif; }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${C.white}"/>
  ${header(title, subtitle, width)}
  ${body}
</svg>`
}

async function writePng(name, markup) {
  const file = path.join(outDir, `${name}.png`)
  await sharp(Buffer.from(markup)).png().toFile(file)
  return file
}

const diagrams = {
  architecture: svg(1800, 980, 'Systeemopbouw', 'Van passagiersinterface naar serverregels en SQLite-data', `
    ${box(90, 205, 310, 150, 'Passagier', ['Mobiele browser', 'Bestemming kiezen', 'Rit volgen'], { fill: C.lightBlue })}
    ${box(500, 180, 360, 200, 'Next.js frontend', ['Startscherm', 'Ritvoorstel', 'Live dashboard', 'Eindoverzicht'], { fill: C.gray })}
    ${box(990, 170, 360, 220, 'Serverlaag', ['API-routes', 'Server-side validatie', 'Prijsberekening', 'Statusovergangen'], { fill: C.lightGreen, stroke: C.green })}
    ${box(1450, 190, 270, 180, 'Payload CMS', ['Collections', 'Access control', 'Admin'], { fill: C.lightOrange, stroke: C.orange })}
    ${box(760, 610, 300, 160, 'Domeinutilities', ['Bereken prijs', 'Controleer voortgang', 'Maak prognose'], { fill: C.white, stroke: C.green })}
    ${box(1220, 600, 340, 180, 'SQLite database', ['Routes', 'Routepunten', 'Ritten', 'Prijsmomenten', 'Tarieven'], { fill: C.lightPurple, stroke: C.purple })}
    ${arrow(400, 280, 500, 280, 'actie')}
    ${arrow(860, 280, 990, 280, 'request')}
    ${arrow(1350, 280, 1450, 280, 'CRUD')}
    ${arrow(1170, 390, 1000, 610, 'regels')}
    ${arrow(1180, 610, 1220, 690, 'opslaan')}
    ${arrow(1450, 370, 1395, 600, 'relaties')}
    ${arrow(990, 360, 860, 360, 'response')}
    ${arrow(500, 360, 400, 360, 'weergave')}
  `),
  dataModel: svg(1900, 1120, 'Conceptueel Datamodel', 'Relaties tussen gebruiker, route, rit, tarief en prijsmomenten', `
    ${box(120, 170, 300, 170, 'Gebruiker', ['id', 'naam', 'email', 'rol'], { fill: C.lightBlue })}
    ${box(805, 170, 330, 185, 'Rit', ['status', 'startTijd / eindTijd', 'actuelePrijs', 'eindPrijs'], { fill: C.gray, stroke: C.ink })}
    ${box(1480, 170, 300, 170, 'Tarief', ['starttarief', 'prijsPerKm', 'prijsPerMinuut', 'status'], { fill: C.lightOrange, stroke: C.orange })}
    ${box(805, 500, 330, 170, 'Route', ['vertrekpunt', 'bestemming', 'totaleAfstandKm', 'geschatteDuurMin'], { fill: C.lightGreen, stroke: C.green })}
    ${box(1450, 500, 330, 170, 'Routepunt', ['volgorde', 'latitude / longitude', 'afstandVanafStartKm'], { fill: C.white, stroke: C.green })}
    ${box(805, 815, 330, 170, 'PrijsMoment', ['tijdstip', 'geredenAfstandKm', 'actuelePrijs', 'voorspeldeEindPrijs'], { fill: C.lightPurple, stroke: C.purple })}
    ${arrow(420, 255, 805, 255, '0..1 naar 0..*')}
    ${arrow(1135, 255, 1480, 255, '1 tarief')}
    ${arrow(970, 355, 970, 500, '1 route')}
    ${arrow(1135, 585, 1450, 585, '1..* punten')}
    ${arrow(970, 670, 970, 815, '0..* momenten')}
    <text x="590" y="230" text-anchor="middle" font-size="22" fill="${C.muted}">passagier</text>
    <text x="1310" y="230" text-anchor="middle" font-size="22" fill="${C.muted}">vaste berekening</text>
    <text x="1188" y="562" text-anchor="middle" font-size="22" fill="${C.muted}">routevolgorde</text>
  `),
  classDiagram: svg(1900, 1240, 'Klassendiagram', 'Conceptuele verantwoordelijkheden in de HitchTracker MVP', `
    ${box(85, 170, 360, 235, 'Gebruiker', ['+ id', '+ naam', '+ email', '+ rol', '+ eigenRitten()'], { fill: C.lightBlue })}
    ${box(760, 160, 380, 255, 'Rit', ['+ status', '+ actuelePrijs', '+ eindPrijs', '+ Start()', '+ VerwerkVoortgang()', '+ RondAf()'], { fill: C.gray, stroke: C.ink })}
    ${box(1460, 170, 350, 235, 'Tarief', ['+ starttarief', '+ prijsPerKm', '+ prijsPerMinuut', '+ BerekenPrijs()'], { fill: C.lightOrange, stroke: C.orange })}
    ${box(760, 525, 380, 220, 'Route', ['+ vertrekpunt', '+ bestemming', '+ totaleAfstandKm', '+ geschatteDuurMin'], { fill: C.lightGreen, stroke: C.green })}
    ${box(1460, 525, 350, 220, 'Routepunt', ['+ volgorde', '+ latitude', '+ longitude', '+ afstandVanafStartKm'], { fill: C.white, stroke: C.green })}
    ${box(760, 860, 380, 220, 'PrijsMoment', ['+ tijdstip', '+ geredenAfstandKm', '+ actuelePrijs', '+ voorspeldeEindPrijs'], { fill: C.lightPurple, stroke: C.purple })}
    ${arrow(445, 285, 760, 285, '0..*')}
    ${arrow(1140, 285, 1460, 285, '1')}
    ${arrow(950, 415, 950, 525, '1')}
    ${arrow(1140, 635, 1460, 635, '1..*')}
    ${arrow(950, 745, 950, 860, '0..*')}
    <text x="602" y="258" text-anchor="middle" font-size="22" fill="${C.muted}">bezit ritten</text>
    <text x="1300" y="258" text-anchor="middle" font-size="22" fill="${C.muted}">gebruikt tarief</text>
    <text x="1195" y="608" text-anchor="middle" font-size="22" fill="${C.muted}">bestaat uit</text>
  `),
  useCases: svg(1800, 1080, 'Usecasediagram', 'Actoren buiten het systeem, functies binnen HitchTracker', `
    <rect x="420" y="150" width="960" height="780" rx="22" fill="${C.gray}" stroke="${C.line}" stroke-width="3"/>
    <text x="900" y="198" text-anchor="middle" font-size="32" font-weight="800" fill="${C.ink}">HitchTracker MVP</text>
    ${box(520, 260, 330, 95, 'Bestemming invoeren', [], { fill: C.white, stroke: C.blue, r: 48, titleSize: 26 })}
    ${box(945, 260, 330, 95, 'Prijsindicatie bekijken', [], { fill: C.white, stroke: C.blue, r: 48, titleSize: 26 })}
    ${box(520, 420, 330, 95, 'Rit starten', [], { fill: C.white, stroke: C.blue, r: 48, titleSize: 26 })}
    ${box(945, 420, 330, 95, 'Rit volgen', [], { fill: C.white, stroke: C.blue, r: 48, titleSize: 26 })}
    ${box(520, 580, 330, 95, 'Eindprijs bekijken', [], { fill: C.white, stroke: C.blue, r: 48, titleSize: 26 })}
    ${box(945, 580, 330, 95, 'Eigen rit terugzien', [], { fill: C.white, stroke: C.blue, r: 48, titleSize: 26 })}
    ${box(720, 750, 380, 95, 'Routes en tarieven beheren', [], { fill: C.white, stroke: C.orange, r: 48, titleSize: 26 })}
    <circle cx="205" cy="300" r="36" fill="${C.white}" stroke="${C.blue}" stroke-width="4"/>
    <line x1="205" y1="336" x2="205" y2="455" stroke="${C.blue}" stroke-width="4"/>
    <line x1="145" y1="385" x2="265" y2="385" stroke="${C.blue}" stroke-width="4"/>
    <line x1="205" y1="455" x2="150" y2="545" stroke="${C.blue}" stroke-width="4"/>
    <line x1="205" y1="455" x2="260" y2="545" stroke="${C.blue}" stroke-width="4"/>
    <text x="205" y="595" text-anchor="middle" font-size="30" font-weight="700" fill="${C.ink}">Passagier</text>
    <circle cx="1585" cy="580" r="36" fill="${C.white}" stroke="${C.orange}" stroke-width="4"/>
    <line x1="1585" y1="616" x2="1585" y2="735" stroke="${C.orange}" stroke-width="4"/>
    <line x1="1525" y1="665" x2="1645" y2="665" stroke="${C.orange}" stroke-width="4"/>
    <line x1="1585" y1="735" x2="1530" y2="825" stroke="${C.orange}" stroke-width="4"/>
    <line x1="1585" y1="735" x2="1640" y2="825" stroke="${C.orange}" stroke-width="4"/>
    <text x="1585" y="875" text-anchor="middle" font-size="30" font-weight="700" fill="${C.ink}">Medewerker</text>
    ${arrow(265, 350, 520, 305, '')}
    ${arrow(265, 385, 520, 468, '')}
    ${arrow(265, 430, 520, 628, '')}
    ${arrow(265, 470, 945, 628, '')}
    ${arrow(1525, 720, 1100, 798, '')}
  `),
  wireframes: svg(2100, 1320, 'Wireframes En Navigatie', 'Mobile first schermen voor voorstel, rit volgen en eindoverzicht', `
    ${phone(110, 175, 'Start', ['HitchTracker', 'Waar wil je naartoe?', 'Vertrek: huidige locatie', 'Bestemming: Museumplein', '', 'Bekijk tijd en prijs'])}
    ${phone(580, 175, 'Voorstel', ['Amsterdam Centraal', '2,4 km    9 min', '', 'Geschatte prijs', 'EUR 12,40', '', 'Start rit'])}
    ${phone(1050, 175, 'Live rit', ['Naar: Museumplein', 'BEZIG', 'gereden =====|-----', '1,5 km gereden', 'Huidige prijs', 'EUR 9,10', 'Eindprijs ca. 12,40'])}
    ${phone(1520, 175, 'Eindscherm', ['Rit afgerond', 'Definitieve prijs', 'EUR 12,80', '', '2,6 km    11 min', 'Schatting 12,40'])}
    ${arrow(455, 565, 580, 565, 'geldig voorstel')}
    ${arrow(925, 565, 1050, 565, 'start')}
    ${arrow(1395, 565, 1520, 565, 'afronden')}
    ${box(505, 1030, 1090, 115, 'Foutpaden', ['Onbekende demo-route, geen actief tarief of ongeldige voortgang tonen een melding en wijzigen geen ritprijs.'], { fill: C.lightRed, stroke: C.red, titleSize: 28, bodySize: 24 })}
  `),
  activity: svg(1900, 1450, 'Activiteitendiagram', 'Beslisflow voor ritvoorstel, live voortgang en eindprijs', `
    ${box(745, 155, 410, 90, 'Start', ['Passagier voert vertrek en bestemming in'], { fill: C.lightBlue, titleSize: 28, bodySize: 22 })}
    ${arrow(950, 245, 950, 325)}
    ${box(745, 325, 410, 92, 'Valideer aanvraag', ['Server zoekt route en actief tarief'], { fill: C.white, stroke: C.blue, titleSize: 28, bodySize: 22 })}
    ${arrow(950, 417, 950, 510)}
    ${diamond(950, 580, 420, 150, 'Route en tarief beschikbaar?')}
    ${arrow(740, 580, 450, 580, 'nee', C.red)}
    ${box(110, 515, 340, 125, 'Toon foutmelding', ['Geen rit starten', 'Geen prijs opslaan'], { fill: C.lightRed, stroke: C.red, titleSize: 27, bodySize: 22 })}
    ${arrow(950, 655, 950, 760, 'ja')}
    ${box(745, 760, 410, 105, 'Bereken voorstel', ['Afstand, duur en prijsindicatie'], { fill: C.lightGreen, stroke: C.green, titleSize: 28, bodySize: 22 })}
    ${arrow(950, 865, 950, 970)}
    ${box(745, 970, 410, 105, 'Start rit', ['Maak rit met status Bezig'], { fill: C.gray, stroke: C.ink, titleSize: 28, bodySize: 22 })}
    ${arrow(1155, 1020, 1450, 1020, 'routepunt')}
    ${box(1450, 945, 340, 150, 'Verwerk voortgang', ['Valideer volgorde', 'Bereken actuele prijs', 'Maak prognose'], { fill: C.lightOrange, stroke: C.orange, titleSize: 27, bodySize: 21 })}
    ${arrow(1620, 1095, 1620, 1200)}
    ${diamond(1620, 1265, 320, 130, 'Laatste routepunt?')}
    ${arrow(1460, 1265, 1155, 1070, 'nee')}
    ${arrow(1620, 1330, 950, 1330, 'ja')}
    ${box(745, 1268, 410, 125, 'Rond rit af', ['Zet eindtijd en eindprijs vast', 'Toon alleen-lezen overzicht'], { fill: C.lightPurple, stroke: C.purple, titleSize: 28, bodySize: 22 })}
  `),
  statusFlow: svg(1750, 780, 'Statusovergangen', 'Welke status een rit mag krijgen en wie die overgang uitvoert', `
    ${box(80, 300, 260, 110, 'Concept', ['Invoer of voorstel'], { fill: C.white })}
    ${box(450, 300, 260, 110, 'Gepland', ['Geldig voorstel'], { fill: C.lightBlue })}
    ${box(820, 300, 260, 110, 'Bezig', ['Route wordt gevolgd'], { fill: C.lightGreen, stroke: C.green })}
    ${box(1190, 300, 260, 110, 'Afgerond', ['Eindprijs vast'], { fill: C.lightPurple, stroke: C.purple })}
    ${box(820, 540, 260, 110, 'Geannuleerd', ['Geen rit uitgevoerd'], { fill: C.lightRed, stroke: C.red })}
    ${arrow(340, 355, 450, 355, 'voorstel')}
    ${arrow(710, 355, 820, 355, 'start')}
    ${arrow(1080, 355, 1190, 355, 'laatste punt')}
    ${arrow(580, 410, 820, 540, 'annuleer', C.red)}
    <text x="875" y="180" text-anchor="middle" font-size="26" fill="${C.muted}">Alleen servercode, medewerker/admin of interne demo-flow schrijft statuswijzigingen.</text>
  `),
  apiFlow: svg(1850, 980, 'API Flow', 'Serverroutes houden prijs- en statusregels buiten de browser', `
    ${box(85, 200, 300, 115, 'Browser', ['Bestemming invoeren'], { fill: C.lightBlue })}
    ${box(555, 200, 370, 115, '/api/route-estimate', ['Valideer input', 'Bereken indicatie'], { fill: C.white })}
    ${box(1160, 200, 300, 115, 'Payload', ['Routes', 'Tarieven'], { fill: C.lightOrange, stroke: C.orange })}
    ${arrow(385, 255, 555, 255, 'POST')}
    ${arrow(925, 255, 1160, 255, 'lees')}
    ${arrow(555, 315, 385, 430, 'voorstel')}
    ${box(85, 470, 300, 115, 'Browser', ['Start rit'], { fill: C.lightBlue })}
    ${box(555, 470, 370, 115, '/api/trips/start', ['Maak rit', 'Status Bezig'], { fill: C.white })}
    ${box(1160, 470, 300, 115, 'SQLite', ['Rit', 'Routepunten'], { fill: C.lightPurple, stroke: C.purple })}
    ${arrow(385, 525, 555, 525, 'POST')}
    ${arrow(925, 525, 1160, 525, 'schrijf')}
    ${box(555, 730, 370, 115, '/api/trips/:id/progress', ['Valideer volgorde', 'Prijs + prognose'], { fill: C.lightGreen, stroke: C.green })}
    ${box(1160, 730, 300, 115, 'PrijsMoment', ['Controleerbaar log'], { fill: C.white, stroke: C.purple })}
    ${arrow(385, 790, 555, 790, 'volgend punt')}
    ${arrow(925, 790, 1160, 790, 'schrijf')}
    ${arrow(555, 730, 385, 600, 'live data')}
    ${box(1505, 470, 260, 115, 'Eindoverzicht', ['Alleen lezen'], { fill: C.gray, stroke: C.ink })}
    ${arrow(1460, 790, 1580, 585, 'laatste punt')}
  `),
}

function phone(x, y, title, rows) {
  const rowText = rows.map((row, i) => {
    const yy = y + 170 + i * 54
    if (!row) return ''
    const isButton = /Bekijk|Start/.test(row)
    if (isButton) {
      return `<rect x="${x + 56}" y="${yy - 32}" width="268" height="48" rx="10" fill="${C.blue}"/><text x="${x + 190}" y="${yy}" text-anchor="middle" font-size="23" font-weight="700" fill="${C.white}">${esc(row)}</text>`
    }
    return `<text x="${x + 190}" y="${yy}" text-anchor="middle" font-size="${i <= 1 ? 25 : 22}" font-weight="${i <= 1 ? 700 : 500}" fill="${i <= 1 ? C.ink : C.muted}">${esc(row)}</text>`
  }).join('')
  return `
    <rect x="${x}" y="${y}" width="380" height="760" rx="44" fill="${C.ink}"/>
    <rect x="${x + 24}" y="${y + 42}" width="332" height="676" rx="26" fill="${C.white}"/>
    <text x="${x + 190}" y="${y + 110}" text-anchor="middle" font-size="30" font-weight="800" fill="${C.blue}">${esc(title)}</text>
    ${rowText}`
}

for (const [name, markup] of Object.entries(diagrams)) {
  await writePng(name, markup)
}

console.log(`Wrote ${Object.keys(diagrams).length} diagrams to ${outDir}`)
