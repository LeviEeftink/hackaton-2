# hackaton-2 / HitchTracker

HitchTracker is een werkende ritapp met Next.js 16, React 19, TypeScript, Payload CMS 3 en SQLite. Passagiers kiezen een route, zien de serverprijs, starten een rit en volgen onderweg de voortgang. Chauffeurs en medewerkers verwerken routepunten en ronden de rit af.

## Features

- Accounts aanmaken, inloggen en uitloggen, met afzonderlijke rechten voor passagiers, chauffeurs, medewerkers en beheerders.
- Routes zoeken en een actueel prijsvoorstel met prijsopbouw ophalen via de API.
- Favoriete routes bewaren per gebruiker in de huidige browser.
- Ritvoortgang en prijs elke vijf seconden verversen, routepunten bekijken en een actieve rit annuleren.
- Dashboard voor actieve ritten; chauffeurs zien toegewezen ritten en medewerkers kunnen alle actieve ritten beheren.
- Ritgeschiedenis met statusfilter en paginering, een CSV-ritbewijs en een afdrukbaar ritoverzicht.
- Vastgelegde afstand, duur en tarieven per rit, herhaalbare API-acties met idempotentiesleutels en auditlogs.
- Herhaalbare demo-seed met vier routes, zeventien routepunten, vier bestemmingen, vier accounts, een voertuig en een tarief. Ontbrekende fixtures worden aangevuld; bestaande gegevens blijven behouden.

## Lokaal starten

Gebruik Node.js 22 en installeer de vastgelegde dependencies:

```sh
npm ci
```

Kopieer `.env.example` naar `.env`. Stel `PAYLOAD_SECRET` in op een eigen unieke waarde van minimaal 32 tekens. `DATABASE_URL=file:./hitchtracker.db` gebruikt een lokale SQLite-database; `NEXT_PUBLIC_SERVER_URL=http://localhost:3000` is de lokale app-URL.

```sh
npm run generate:importmap
npm run generate:types
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Je kunt `npm run seed` opnieuw uitvoeren om ontbrekende demo-routes en routepunten te herstellen.

### Demo-accounts

Alle onderstaande accounts hebben het demowachtwoord **`HitchTrackerDemo2026!`**.

| Rol | E-mailadres | Mogelijkheden |
| --- | --- | --- |
| Passagier | `passenger@hitchtracker.test` | Rit starten, eigen ritten volgen en annuleren, ritbewijzen ophalen |
| Chauffeur | `driver@hitchtracker.test` | Toegewezen ritten volgen, routepunten verwerken en afronden |
| Medewerker | `operator@hitchtracker.test` | Alle ritten beheren en chauffeurs toewijzen |
| Beheerder | `admin@hitchtracker.test` | Beheer, inclusief gebruikersrollen |

Nieuwe registraties krijgen de rol passagier. Vervang de demo-accountwachtwoorden wanneer je deze accounts buiten de demo gebruikt.

### Een volledige rit demonstreren

1. Log in als passagier, kies een route en start de rit vanuit het prijsvoorstel.
2. Log in als medewerker of beheerder en open `/chauffeur`. Open de rit om de voortgang bij te werken, of wijs in `/admin/collections/rides` eerst een chauffeur toe.
3. De toegewezen chauffeur ziet de rit in `/chauffeur`. Verwerk de routepunten handmatig met **Routepunt bereikt** en rond na het laatste punt de rit af.
4. De passagier ziet de voortgang bij verversen en vindt de afgeronde rit in `/geschiedenis`, inclusief CSV-ritbewijs en afdrukmogelijkheid.

De demo verwerkt handmatig bevestigde routepunten. De getoonde rittijd is berekend op basis van de vastgelegde routeafstand en geschatte duur.

## Schermen

| URL | Scherm |
| --- | --- |
| `/` | Routeplanner, zoeken en favorieten |
| `/account` | Inloggen en registreren |
| `/voorstel?route=1` | Tijd- en prijsvoorstel voor een route |
| `/rit?id=1` | Rit volgen, annuleren en toegestane beheeracties |
| `/eind?id=1` | Ritoverzicht, CSV en afdrukken |
| `/geschiedenis` | Ritgeschiedenis met statusfilter en pagina's |
| `/chauffeur` | Dashboard voor chauffeurs en medewerkers |
| `/admin` | Payload-beheer voor medewerkers en beheerders |

Vervang de voorbeeld-ID's door de ID van je gekozen route of rit.

## API en datamodel

Payload REST staat onder `/api`. Authenticatie gebruikt `/api/users/login`, `/api/users/logout` en `/api/users/me`; registreren gebeurt via `POST /api/users`.

| Endpoint | Invoer of resultaat |
| --- | --- |
| `GET /api/routes` | Beschikbare routes; medewerkers kunnen ook inactieve routes lezen |
| `POST /api/routes/quote` | `{ "routeId": 1 }` geeft een openbaar tijd- en prijsvoorstel |
| `POST /api/rides/start` | `{ "routeId": 1, "idempotencyKey": "start-0001" }` start een rit voor de ingelogde passagier |
| `GET /api/rides/:id/tracking` | Ritstatus, voortgang, serverprijzen en routepunten |
| `POST /api/rides/:id/advance` | `{ "routePointId": 2, "idempotencyKey": "progress-0001" }` bevestigt een routepunt |
| `POST /api/rides/:id/complete` | `{ "idempotencyKey": "complete-0001" }` rondt de rit af na het laatste routepunt |
| `POST /api/rides/:id/cancel` | `{ "idempotencyKey": "cancel-0001", "reason": "..." }` annuleert een actieve of voorgestelde rit |
| `GET /api/rides/history?status=completed&page=1&limit=10` | Gefilterde ritten met paginering; `status` is optioneel, `limit` is maximaal 50 |
| `GET /api/rides/:id/receipt` | CSV-ritbewijs voor een afgeronde rit met opgeslagen eindprijs |

De geschiedenis ondersteunt `quoted`, `active`, `completed` en `cancelled`. Passagiers lezen hun eigen ritten; chauffeurs lezen toegewezen ritten; medewerkers en beheerders lezen alle ritten. Dezelfde rechten gelden voor tracking, geschiedenis en ritbewijzen. Alleen de toegewezen chauffeur of een medewerker/beheerder mag voortgang verwerken en afronden. De eigenaar kan een eigen rit annuleren.

`users` beheert accounts en rollen. `rides` koppelt passagier, route en tarief, met optioneel chauffeur en voertuig. `route-points` hebben een unieke volgorde per route; `ride-events` en `audit-logs` leggen acties vast. Afstand, duur en tariefregels worden bij de start opgeslagen, zodat wijzigingen aan de route of tarieven de berekening van bestaande ritten niet veranderen. Prijzen worden uitsluitend op de server berekend.

Gebruik voor iedere nieuwe mutatie een nieuwe idempotentiesleutel van 8–100 letters, cijfers, `_` of `-`; herhaal hetzelfde verzoek met dezelfde sleutel. Een sleutel is gekoppeld aan de oorspronkelijke rit en actie.

## Productie starten

Na het instellen van `.env`, genereren van Payload-bestanden en vullen van de database:

```sh
npm run build
npm run start
```

`npm run start` gebruikt `scripts/start.mjs`. Dit script kopieert de statische bestanden naar de standalone-build en maakt een relatief SQLite-pad absoluut ten opzichte van de projectmap. Daardoor gebruikt de standalone-server dezelfde database als de seed. Je kunt ook een expliciet absoluut pad instellen, bijvoorbeeld `DATABASE_URL=file:C:/data/hitchtracker.db`.

## Controle

```sh
npm test
npm run typecheck
npm run build
```

`npm test` controleert prijs- en statusregels, idempotentie en toegang, veilige loginomleidingen, ritgeschiedenis en CSV-ritbewijzen, en herhaald seeden met herstel van ontbrekende fixtures. De seed-integratietest gebruikt een eigen SQLite-geheugendatabase.

Voor de HTTP-integratiecontrole moet de lokale app draaien en de demo-seed aanwezig zijn. Deze controle maakt eigen testaccounts en ritten aan in de lokale database:

```sh
npm run test:api
```

De test gebruikt standaard `http://localhost:3000`; stel `TEST_BASE_URL` in voor een andere lokale poort.

GitHub Actions voert bij pushes en pull requests installatie, generatie van Payload-bestanden, tests en TypeScript-controle uit. De workflow vult een eigen CI-database, maakt een productiebuild en test de HTTP-integratie met de productieserver. De configuratie gebruikt een synthetische secret.

## Ontwerpdocumenten

- [Functioneel ontwerp](docs/ontwerp/functioneel-ontwerp.docx)
- [Ontwerp fase 1](docs/ontwerp/ontwerp-fase-1.docx)
- [Architectuur, datamodel en overige diagrammen](docs/ontwerp/diagrams/)
