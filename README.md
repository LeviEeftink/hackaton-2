# HitchTracker backend

Werkende backend voor de HitchTracker MVP. De stack is gelijk aan Hackaton 1: Next.js 16, React 19, TypeScript, Payload CMS 3 en SQLite.

## Starten

1. Kopieer `.env.example` naar `.env` en vervang `PAYLOAD_SECRET` door een lange unieke waarde.
2. Installeer dependencies met `npm install`.
3. Genereer Payload-bestanden met `npm run generate:importmap` en `npm run generate:types`.
4. Voeg demo-data toe met `npm run seed`.
5. Start met `npm run dev`.

Voor `npm run start` in productie moet `DATABASE_URL` naar een absolute locatie wijzen, bijvoorbeeld `file:C:/data/hitchtracker.db`. De standalone Next-server draait vanuit `.next/standalone`, waardoor een relatief SQLite-pad daar anders terechtkomt.

Open `http://localhost:3000/admin` voor het Payload-beheer. De eerste beheerder staat na de seed klaar op `admin@hitchtracker.test` met wachtwoord `HitchTrackerDemo2026!`. Verander dit wachtwoord buiten een demo-omgeving.

## Datamodel

`users` beheert login en rollen. Een `ride` verwijst naar precies één passagier, route en tarief en optioneel naar chauffeur en voertuig. De rit bevat een tariefmomentopname, zodat historische prijzen onveranderd blijven als het standaardtarief wordt aangepast. `route-points` horen bij één route en hebben een unieke volgorde. `ride-events` zijn append-only voortgangsrecords met een unieke idempotentiesleutel. `audit-logs` maken start, voortgang, afronden en annuleren controleerbaar.

## API

Payload REST staat onder `/api`. De domein-endpoints zijn:

- `POST /api/routes/quote` met `{ "routeId": 1 }` geeft een openbare tijd- en prijsindicatie.
- `POST /api/rides/start` met `{ "routeId": 1, "idempotencyKey": "start-0001" }` start voor de ingelogde passagier een rit.
- `GET /api/rides/:id/tracking` geeft een rit en routepunten terug aan de eigenaar, chauffeur of medewerker.
- `POST /api/rides/:id/advance` met `{ "routePointId": 2, "idempotencyKey": "progress-0001" }` verwerkt één server-gevalideerd routepunt.
- `POST /api/rides/:id/complete` met `{ "idempotencyKey": "complete-0001" }` rondt alleen een rit af die het laatste routepunt heeft bereikt.
- `POST /api/rides/:id/cancel` met `{ "idempotencyKey": "cancel-0001", "reason": "..." }` annuleert een actieve of voorgestelde rit.

Passagiers kunnen alleen eigen ritten lezen. Chauffeurs alleen toegewezen ritten. Medewerkers en beheerders beheren ritten, routes, tarieven en voertuigen. De browser levert nooit prijzen, voortgangsafstand of eindprijzen aan: alle bedragen komen uit server-side tariefregels.

## Controle

Voer `npm run test:backend` uit voor de prijs- en statusregels en `npm run typecheck` voor TypeScript-validatie.
