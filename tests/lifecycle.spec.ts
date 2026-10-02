import assert from 'node:assert/strict'

import { APIError, type PayloadRequest } from 'payload'

import { Routes, RoutePoints } from '../src/collections/Routes'
import { quoteEndpoint, rideEndpoints } from '../src/endpoints/rides'

type Document = Record<string, any>
type LocalOptions = { collection: string; id?: number; data?: Document; where?: Document; sort?: string; limit?: number; overrideAccess?: boolean; user?: Document }

const passenger = { id: 1, role: 'passenger' }
const driver = { id: 2, role: 'driver' }
const operator = { id: 3, role: 'operator' }
const rules = { currency: 'EUR', startFareCents: 350, pricePerKmCents: 220, pricePerMinuteCents: 35 }

const rideFixture = (): Document => ({
  id: 10,
  reference: 'HT-TEST',
  status: 'active',
  passenger: passenger.id,
  driver: driver.id,
  route: 20,
  tariff: 30,
  journey: {
    pickupLabel: 'Station',
    destinationLabel: 'Campus',
    quotedDistanceMeters: 2600,
    quotedDurationSeconds: 660,
    quotedFareCents: 1307,
    startedAt: '2026-01-01T09:00:00.000Z',
  },
  tariffSnapshot: rules,
  progress: {
    lastRouteSequence: 0,
    drivenDistanceMeters: 0,
    elapsedSeconds: 0,
    progressPercent: 0,
    currentFareCents: 350,
    estimatedFinalFareCents: 1307,
  },
})

const matches = (document: Document, where: Document | undefined): boolean => {
  if (!where) return true
  if (where.and) return where.and.every((clause: Document) => matches(document, clause))
  if (where.or) return where.or.some((clause: Document) => matches(document, clause))
  return Object.entries(where).every(([key, condition]) => {
    if ('equals' in condition) return document[key] === condition.equals
    if ('not_equals' in condition) return document[key] !== condition.not_equals
    if ('greater_than' in condition) return document[key] > condition.greater_than
    if ('less_than' in condition) return document[key] < condition.less_than
    throw new Error(`Unsupported test query for ${key}`)
  })
}

const createMock = (initialRide = rideFixture()) => {
  const documents: Record<string, Document[]> = {
    rides: [structuredClone(initialRide)],
    // Editing route configuration must not change an already booked journey.
    routes: [{ id: 20, isActive: true, pickupLabel: 'Changed pickup', destinationLabel: 'Changed destination', totalDistanceMeters: 5200, estimatedDurationSeconds: 1320 }],
    'route-points': [
      { id: 40, route: 20, sequence: 1, label: 'Start', latitude: 52, longitude: 5, distanceFromStartMeters: 0 },
      { id: 41, route: 20, sequence: 2, label: 'Halfway', latitude: 52, longitude: 5, distanceFromStartMeters: 1300 },
      { id: 42, route: 20, sequence: 3, label: 'Finish', latitude: 52, longitude: 5, distanceFromStartMeters: 2600 },
    ],
    tariffs: [{ id: 30, isActive: true, validFrom: '2020-01-01T00:00:00.000Z', ...rules }],
    'ride-events': [],
    'audit-logs': [],
  }
  const calls: LocalOptions[] = []
  const writes: LocalOptions[] = []
  const payload = {
    findByID: async (options: LocalOptions) => {
      calls.push(options)
      const document = documents[options.collection]?.find((candidate) => candidate.id === options.id)
      if (!document) throw new Error('Not found')
      if (options.collection === 'rides' && options.overrideAccess === false) {
        const user = options.user
        const allowed = user && (['operator', 'admin'].includes(user.role) || document.passenger === user.id || document.driver === user.id)
        if (!allowed) throw new Error('Access denied')
      }
      return structuredClone(document)
    },
    find: async (options: LocalOptions) => {
      calls.push(options)
      let docs = documents[options.collection].filter((document) => matches(document, options.where))
      if (options.sort === '-sequence') docs.sort((left, right) => right.sequence - left.sequence)
      if (options.sort === 'sequence') docs.sort((left, right) => left.sequence - right.sequence)
      if (options.limit) docs = docs.slice(0, options.limit)
      return { docs: structuredClone(docs) }
    },
    count: async (options: LocalOptions) => ({ totalDocs: documents[options.collection].filter((document) => matches(document, options.where)).length }),
    update: async (options: LocalOptions) => {
      writes.push(options)
      const index = documents[options.collection].findIndex((document) => document.id === options.id)
      assert.notEqual(index, -1)
      documents[options.collection][index] = { ...documents[options.collection][index], ...options.data }
      return structuredClone(documents[options.collection][index])
    },
    create: async (options: LocalOptions) => {
      writes.push(options)
      if (options.collection === 'ride-events') {
        // Model the actual event field constraint so an overlong cancellation cannot silently pass.
        assert.ok(!options.data?.note || options.data.note.length <= 250)
      }
      const document = { ...options.data, id: documents[options.collection].length + 100 }
      documents[options.collection].push(document)
      return structuredClone(document)
    },
  }
  const request = (body: Document = {}, user: Document | null = driver, id: unknown = 10): PayloadRequest => ({
    user,
    routeParams: { id },
    json: async () => body,
    payload,
  }) as unknown as PayloadRequest
  return { documents, calls, writes, request }
}

const endpoint = (path: string) => {
  const result = rideEndpoints.find((candidate) => candidate.path === path)
  assert.ok(result, `Missing endpoint ${path}`)
  return result.handler
}

const advance = endpoint('/:id/advance')
const complete = endpoint('/:id/complete')
const cancel = endpoint('/:id/cancel')
const tracking = endpoint('/:id/tracking')

const rejectsStatus = async (work: Promise<unknown>, status: number): Promise<void> => {
  await assert.rejects(work, (error: unknown) => error instanceof APIError && error.status === status)
}

// A completed request can be retried after its own status transition without another write.
{
  const ride = rideFixture()
  ride.progress.lastRouteSequence = 3
  const mock = createMock(ride)
  const body = { idempotencyKey: 'complete-001' }
  const first = await (await complete(mock.request(body))).json()
  assert.equal(first.ride.status, 'completed')
  assert.equal(first.ride.progress.drivenDistanceMeters, 2600)
  assert.equal(first.ride.progress.elapsedSeconds, 660)
  assert.equal(first.ride.progress.finalFareCents, 1307)
  assert.equal(mock.documents['ride-events'][0].currentFareCents, 1307)
  assert.equal(mock.calls.some((call) => call.collection === 'routes'), false)
  const writesBeforeRetry = mock.writes.length
  const retry = await (await complete(mock.request(body))).json()
  assert.equal(retry.idempotent, true)
  assert.equal(retry.ride.status, 'completed')
  assert.equal(mock.writes.length, writesBeforeRetry)
  await rejectsStatus(complete(mock.request({ idempotencyKey: 'complete-002' })), 409)
}

// Cancellation stores a reason that fits both the journey and its event, and retries stay harmless.
{
  const mock = createMock()
  const body = { idempotencyKey: 'cancel-001', reason: `  ${'x'.repeat(500)}  ` }
  const first = await (await cancel(mock.request(body, passenger))).json()
  assert.equal(first.ride.status, 'cancelled')
  assert.equal(first.ride.journey.cancellationReason.length, 250)
  assert.equal(mock.documents['ride-events'][0].note, first.ride.journey.cancellationReason)
  const writesBeforeRetry = mock.writes.length
  const retry = await (await cancel(mock.request(body, passenger))).json()
  assert.equal(retry.idempotent, true)
  assert.equal(mock.writes.length, writesBeforeRetry)
  await rejectsStatus(cancel(mock.request({ idempotencyKey: 'cancel-002' }, passenger)), 409)
}

// A key belongs to one ride and one action. Conflicts must never be accepted as retries.
for (const [handler, expectedKind] of [[advance, 'progress'], [complete, 'completed'], [cancel, 'cancelled']] as const) {
  for (const event of [{ ride: 999, kind: expectedKind }, { ride: 10, kind: expectedKind === 'progress' ? 'completed' : 'progress' }]) {
    const mock = createMock()
    mock.documents['ride-events'].push({ id: 100, idempotencyKey: 'reused-key', ...event })
    await rejectsStatus(handler(mock.request({ idempotencyKey: 'reused-key', routePointId: 41 })), 409)
    assert.equal(mock.writes.length, 0)
  }
}

// Normal progression uses the quote snapshot despite route changes, including the completion price.
{
  const mock = createMock()
  const halfway = await (await advance(mock.request({ idempotencyKey: 'advance-001', routePointId: 41 }))).json()
  assert.equal(halfway.ride.progress.drivenDistanceMeters, 1300)
  assert.equal(halfway.ride.progress.elapsedSeconds, 330)
  assert.equal(halfway.ride.progress.progressPercent, 50)
  assert.equal(halfway.ride.progress.currentFareCents, 829)
  assert.equal(halfway.ride.progress.estimatedFinalFareCents, 1307)
  await advance(mock.request({ idempotencyKey: 'advance-002', routePointId: 42 }))
  const finished = await (await complete(mock.request({ idempotencyKey: 'complete-003' }))).json()
  assert.equal(finished.ride.progress.finalFareCents, 1307)
  assert.equal(mock.calls.some((call) => call.collection === 'routes'), false)
  const writesBeforeRetry = mock.writes.length
  const progressRetry = await (await advance(mock.request({ idempotencyKey: 'advance-001', routePointId: 41 }))).json()
  assert.equal(progressRetry.idempotent, true)
  assert.equal(mock.writes.length, writesBeforeRetry)
}

// Newly edited route points cannot exceed the booked fare or move driven distance backwards.
{
  const mock = createMock()
  mock.documents['route-points'][2].distanceFromStartMeters = 5200
  const result = await (await advance(mock.request({ idempotencyKey: 'bounded-001', routePointId: 42 }))).json()
  assert.equal(result.ride.progress.drivenDistanceMeters, 2600)
  assert.equal(result.ride.progress.progressPercent, 100)
  assert.equal(result.ride.progress.currentFareCents, 1307)
  assert.equal(result.ride.progress.elapsedSeconds, 660)
}
{
  const ride = rideFixture()
  ride.progress = { ...ride.progress, lastRouteSequence: 2, drivenDistanceMeters: 2000 }
  const mock = createMock(ride)
  mock.documents['route-points'][2].distanceFromStartMeters = 1000
  await rejectsStatus(advance(mock.request({ idempotencyKey: 'backwards-001', routePointId: 42 })), 409)
  assert.equal(mock.writes.length, 0)
}
{
  const mock = createMock()
  mock.documents['route-points'][1].distanceFromStartMeters = Number.NaN
  await rejectsStatus(advance(mock.request({ idempotencyKey: 'invalid-distance', routePointId: 41 })), 409)
  assert.equal(mock.writes.length, 0)
}

// IDs are parsed before database calls; zero, overflow and non-integer forms are invalid.
for (const value of [undefined, null, {}, [], 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '0', '-1', '1.5', '1e2', '9007199254740993', '']) {
  const mock = createMock()
  await rejectsStatus(quoteEndpoint.handler(mock.request({ routeId: value })), 400)
  const trackingRequest = mock.request({}, passenger)
  trackingRequest.routeParams = { id: value } as PayloadRequest['routeParams']
  await rejectsStatus(tracking(trackingRequest), 400)
  assert.equal(mock.calls.length, 0)
}
{
  const mock = createMock()
  const quote = await (await quoteEndpoint.handler(mock.request({ routeId: ' 20 ' }))).json()
  assert.equal(quote.route.id, 20)
  await rejectsStatus(advance(mock.request({ idempotencyKey: 'invalid-point', routePointId: '0' })), 400)
  await rejectsStatus(advance(mock.request({ idempotencyKey: 'missing-point', routePointId: 999 })), 404)
  await rejectsStatus(quoteEndpoint.handler(mock.request({ routeId: 999 })), 404)
  assert.equal(mock.writes.length, 0)
}

// Completion requires the final route point; a point from another route is never accepted.
{
  const mock = createMock()
  await rejectsStatus(complete(mock.request({ idempotencyKey: 'not-finished' })), 409)
  mock.documents['route-points'][1].route = 99
  await rejectsStatus(advance(mock.request({ idempotencyKey: 'foreign-point', routePointId: 41 })), 400)
  assert.equal(mock.writes.length, 0)
}

// Authorization is checked before retry handling or any mutation.
{
  const mock = createMock()
  for (const handler of [advance, complete, cancel]) {
    await rejectsStatus(handler(mock.request({ idempotencyKey: 'auth-check', routePointId: 41 }, null)), 401)
  }
  await rejectsStatus(advance(mock.request({ idempotencyKey: 'auth-passenger', routePointId: 41 }, passenger)), 403)
  await rejectsStatus(complete(mock.request({ idempotencyKey: 'auth-passenger' }, passenger)), 403)
  await rejectsStatus(cancel(mock.request({ idempotencyKey: 'auth-unrelated' }, { id: 999, role: 'passenger' })), 404)
  await rejectsStatus(advance(mock.request({ idempotencyKey: 'auth-unrelated', routePointId: 41 }, { id: 999, role: 'driver' })), 404)
  assert.equal(mock.writes.length, 0)
  await advance(mock.request({ idempotencyKey: 'auth-driver', routePointId: 41 }, driver))
  await cancel(mock.request({ idempotencyKey: 'auth-operator' }, operator))
  assert.equal(mock.documents.rides[0].status, 'cancelled')
  const rideReads = mock.calls.filter((call) => call.collection === 'rides')
  assert.ok(rideReads.every((call) => call.overrideAccess === false && call.user))
}
{
  const mock = createMock()
  mock.documents.rides[0].status = 'completed'
  mock.documents['ride-events'].push({ id: 100, ride: 10, kind: 'completed', idempotencyKey: 'completed-auth' })
  await rejectsStatus(complete(mock.request({ idempotencyKey: 'completed-auth' }, passenger)), 403)
  assert.equal(mock.writes.length, 0)
}

// Route editing enforces whole distances and checks partial updates against neighboring points.
{
  const distanceField = RoutePoints.fields.find((field) => 'name' in field && field.name === 'distanceFromStartMeters')
  const totalField = Routes.fields.find((field) => 'name' in field && field.name === 'totalDistanceMeters')
  assert.ok(distanceField && 'validate' in distanceField && distanceField.validate)
  assert.ok(totalField && 'validate' in totalField && totalField.validate)
  const validateDistance = distanceField.validate as (value: number) => boolean | string
  const validateTotal = totalField.validate as (value: number) => boolean | string
  assert.equal(validateDistance(0), true)
  assert.notEqual(validateDistance(0.5), true)
  assert.notEqual(validateDistance(Number.MAX_SAFE_INTEGER + 1), true)
  assert.notEqual(validateTotal(0), true)
  assert.notEqual(validateTotal(Number.MAX_SAFE_INTEGER + 1), true)

  const beforeChange = RoutePoints.hooks?.beforeChange?.[0] as unknown as (args: Document) => Promise<unknown>
  const beforeValidate = RoutePoints.hooks?.beforeValidate?.[0] as unknown as (args: Document) => Promise<unknown>
  const mock = createMock()
  const originalDoc = mock.documents['route-points'][1]
  await assert.rejects(beforeChange({ data: { distanceFromStartMeters: 2700 }, originalDoc, req: mock.request() }), /afstand.*teruglopen/)
  await assert.rejects(beforeChange({ data: { distanceFromStartMeters: 1200 }, originalDoc: mock.documents['route-points'][2], req: mock.request() }), /afstand.*teruglopen/)
  await assert.rejects(beforeChange({ data: { distanceFromStartMeters: 5300 }, originalDoc, req: mock.request() }), /totale routeafstand/)
  await assert.rejects(beforeValidate({ data: { sequence: 3 }, originalDoc, req: mock.request() }), /uniek/)
  const validUpdate = { distanceFromStartMeters: 1400 }
  assert.equal(await beforeChange({ data: validUpdate, originalDoc, req: mock.request() }), validUpdate)
}

console.log('Rit-lifecycle: idempotentie, prijsbehoud, invoervalidatie en autorisatie geslaagd')
