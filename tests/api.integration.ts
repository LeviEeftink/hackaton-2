import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const baseURL = new URL(process.env.TEST_BASE_URL || 'http://localhost:3000')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(baseURL.hostname), 'Deze integratietest gebruikt uitsluitend een lokale server.')

type JSONData = Record<string, any>

// Each account has its own HTTP-only cookie jar; session tokens are never logged.
class Client {
  private cookies = new Map<string, string>()

  async request(path: string, method = 'GET', body?: JSONData): Promise<Response> {
    const headers = new Headers({ Origin: baseURL.origin })
    if (body) headers.set('Content-Type', 'application/json')
    if (this.cookies.size) headers.set('Cookie', [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; '))
    const response = await fetch(new URL(path, baseURL), {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    })
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0]
      const separator = pair.indexOf('=')
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
    }
    return response
  }

  async json(path: string, method = 'GET', body?: JSONData, expectedStatus = 200): Promise<JSONData> {
    const response = await this.request(path, method, body)
    assert.equal(response.status, expectedStatus, `${method} ${path}: verwacht HTTP ${expectedStatus}, kreeg ${response.status}`)
    return await response.json() as JSONData
  }
}

const waitForServer = async (): Promise<void> => {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(new URL('/api/routes?limit=1&depth=0', baseURL), { signal: AbortSignal.timeout(5000) })
      if (response.ok) return
    } catch {
      // The dev server may still be starting or compiling its first API request.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error('De lokale API is na 60 seconden nog niet bereikbaar. Start eerst de ontwikkelserver en seed de demo-data.')
}

await waitForServer()

const anonymous = new Client()
const passenger = new Client()
const otherPassenger = new Client()
const operator = new Client()
const runID = randomUUID()
const password = `LocalTest-${randomUUID()}!`
const passengerEmail = `api-passenger-${runID}@hitchtracker.test`
const otherEmail = `api-other-${runID}@hitchtracker.test`

const created = await anonymous.json('/api/users', 'POST', {
  name: 'API Test Passagier', email: passengerEmail, password, role: 'admin',
}, 201)
assert.equal(created.doc.role, 'passenger', 'Publieke registratie mag geen beheerder maken.')
const secondCreated = await anonymous.json('/api/users', 'POST', {
  name: 'API Andere Passagier', email: otherEmail, password,
}, 201)
assert.equal(secondCreated.doc.role, 'passenger')
assert.notEqual(secondCreated.doc.id, created.doc.id)

const login = await passenger.json('/api/users/login', 'POST', { email: passengerEmail, password })
assert.equal(login.user.role, 'passenger')
assert.equal((await passenger.json('/api/users/me')).user.id, created.doc.id, 'Login-cookie authenticeert volgende verzoeken.')
await otherPassenger.json('/api/users/login', 'POST', { email: otherEmail, password })
const operatorLogin = await operator.json('/api/users/login', 'POST', { email: 'operator@hitchtracker.test', password: 'HitchTrackerDemo2026!' })
assert.equal(operatorLogin.user.role, 'operator')

const available = await anonymous.json('/api/routes?limit=100&depth=0')
assert.ok(available.docs.length >= 4, 'Seed eerst de vier demo-routes.')
const route = available.docs.find((candidate: JSONData) => candidate.name === 'Amsterdam Centraal naar Museumplein') || available.docs[0]
assert.equal(route.isActive, true)
const quote = await anonymous.json('/api/routes/quote', 'POST', { routeId: route.id })
assert.equal(quote.route.id, route.id)
assert.ok(Number.isSafeInteger(quote.quote.totalFareCents) && quote.quote.totalFareCents > 0)
await anonymous.json('/api/routes/quote', 'POST', { routeId: '0' }, 400)
await anonymous.json('/api/routes/quote', 'POST', { routeId: '9007199254740993' }, 400)

const startBody = { routeId: route.id, idempotencyKey: `start-${runID}` }
const started = await passenger.json('/api/rides/start', 'POST', startBody, 201)
const rideID = started.ride.id
assert.equal(started.ride.status, 'active')
assert.equal(started.ride.passenger?.id ?? started.ride.passenger, created.doc.id)
assert.equal(started.ride.journey.quotedFareCents, quote.quote.totalFareCents)
const startRetry = await passenger.json('/api/rides/start', 'POST', startBody)
assert.equal(startRetry.ride.id, rideID)
assert.equal(startRetry.idempotent, true)

await anonymous.json(`/api/rides/${rideID}/tracking`, 'GET', undefined, 401)
await anonymous.json('/api/rides/history', 'GET', undefined, 401)
await anonymous.json(`/api/rides/${rideID}/receipt`, 'GET', undefined, 401)
await otherPassenger.json(`/api/rides/${rideID}/tracking`, 'GET', undefined, 404)
await otherPassenger.json(`/api/rides/${rideID}/receipt`, 'GET', undefined, 404)
await passenger.json(`/api/rides/${rideID}/receipt`, 'GET', undefined, 409)
assert.equal((await otherPassenger.json('/api/rides/history')).totalDocs, 0)
assert.equal((await otherPassenger.json(`/api/rides?where[id][equals]=${rideID}&depth=0`)).totalDocs, 0, 'Ook de standaard API verbergt andermans rit.')

const tracked = await passenger.json(`/api/rides/${rideID}/tracking`)
assert.equal(tracked.ride.id, rideID)
assert.ok(tracked.routePoints.length >= 2)
const points = [...tracked.routePoints].sort((left: JSONData, right: JSONData) => left.sequence - right.sequence)
await passenger.json(`/api/rides/${rideID}/advance`, 'POST', { routePointId: points[0].id, idempotencyKey: `denied-advance-${runID}` }, 403)
await passenger.json(`/api/rides/${rideID}/complete`, 'POST', { idempotencyKey: `denied-complete-${runID}` }, 403)
await operator.json(`/api/rides/${rideID}/complete`, 'POST', { idempotencyKey: `early-complete-${runID}` }, 409)
const activeForOperator = await operator.json('/api/rides?where[status][equals]=active&limit=100&depth=0&sort=-createdAt')
assert.ok(activeForOperator.docs.some((candidate: JSONData) => candidate.id === rideID))

let previousDistance = 0
let previousFare = 0
for (const point of points) {
  const progressed = await operator.json(`/api/rides/${rideID}/advance`, 'POST', {
    routePointId: point.id, idempotencyKey: `progress-${point.sequence}-${runID}`,
  })
  assert.equal(progressed.ride.progress.lastRouteSequence, point.sequence)
  assert.ok(progressed.ride.progress.drivenDistanceMeters >= previousDistance)
  assert.ok(progressed.ride.progress.currentFareCents >= previousFare)
  assert.equal(progressed.ride.progress.estimatedFinalFareCents, quote.quote.totalFareCents)
  previousDistance = progressed.ride.progress.drivenDistanceMeters
  previousFare = progressed.ride.progress.currentFareCents
}

const completionBody = { idempotencyKey: `complete-${runID}` }
const completed = await operator.json(`/api/rides/${rideID}/complete`, 'POST', completionBody)
assert.equal(completed.ride.status, 'completed')
assert.equal(completed.ride.progress.progressPercent, 100)
assert.equal(completed.ride.progress.finalFareCents, quote.quote.totalFareCents)
assert.equal(completed.ride.progress.drivenDistanceMeters, quote.route.totalDistanceMeters)
const completionRetry = await operator.json(`/api/rides/${rideID}/complete`, 'POST', completionBody)
assert.equal(completionRetry.idempotent, true)
assert.equal(completionRetry.ride.progress.finalFareCents, completed.ride.progress.finalFareCents)
await operator.json(`/api/rides/${rideID}/cancel`, 'POST', completionBody, 409)

const receipt = await passenger.request(`/api/rides/${rideID}/receipt`)
assert.equal(receipt.status, 200)
assert.match(receipt.headers.get('content-type') || '', /^text\/csv; charset=utf-8/)
assert.equal(receipt.headers.get('cache-control'), 'private, no-store')
assert.equal(receipt.headers.get('x-content-type-options'), 'nosniff')
assert.equal(receipt.headers.get('content-disposition'), `attachment; filename="hitchtracker-rit-${rideID}-bewijs.csv"`)
const csv = await receipt.text()
assert.ok(csv.includes('"Omschrijving","Waarde"'))
assert.ok(csv.includes(`"Ritnummer","${completed.ride.reference}"`))
assert.ok(csv.includes(`"Eindprijs (centen)","${quote.quote.totalFareCents}"`))
assert.ok(csv.includes(`"Gereden afstand (meter)","${quote.route.totalDistanceMeters}"`))
await otherPassenger.json(`/api/rides/${rideID}/receipt`, 'GET', undefined, 404)
const history = await passenger.json('/api/rides/history?status=completed&limit=10')
assert.equal(history.totalDocs, 1)
assert.equal(history.docs[0].id, rideID)
assert.equal(history.docs[0].progress.finalFareCents, quote.quote.totalFareCents)
assert.equal((await passenger.json('/api/rides/history?status=active')).totalDocs, 0)
await passenger.json('/api/rides/history?status=unknown', 'GET', undefined, 400)

const secondRide = await passenger.json('/api/rides/start', 'POST', { routeId: route.id, idempotencyKey: `second-start-${runID}` }, 201)
const secondRideID = secondRide.ride.id
await operator.json(`/api/rides/${secondRideID}/complete`, 'POST', completionBody, 409)
const cancellationBody = { idempotencyKey: `cancel-${runID}`, reason: `  ${'Lange annuleringsreden '.repeat(40)}  ` }
const cancelled = await passenger.json(`/api/rides/${secondRideID}/cancel`, 'POST', cancellationBody)
assert.equal(cancelled.ride.status, 'cancelled')
assert.equal(cancelled.ride.journey.cancellationReason.length, 250, 'De annuleringsreden past in de 250-tekens eventnotitie.')
const cancelRetry = await passenger.json(`/api/rides/${secondRideID}/cancel`, 'POST', cancellationBody)
assert.equal(cancelRetry.idempotent, true)
assert.equal(cancelRetry.ride.id, secondRideID)
await passenger.json(`/api/rides/${secondRideID}/receipt`, 'GET', undefined, 409)
const cancellationHistory = await passenger.json('/api/rides/history?status=cancelled')
assert.equal(cancellationHistory.totalDocs, 1)
assert.equal(cancellationHistory.docs[0].id, secondRideID)
assert.equal((await passenger.json('/api/rides/history')).totalDocs, 2)
assert.equal((await otherPassenger.json('/api/rides/history')).totalDocs, 0)

console.log('Live API-integratie: registratie, sessies, autorisatie, rit-lifecycle, historie en CSV geslaagd')
