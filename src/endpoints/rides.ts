import { APIError, type PayloadRequest } from 'payload'

import { isDriver, isOperator, relationID, type HitchUser, type RelationshipValue } from '@/access/roles'
import { calculateFare, type FareRules } from '@/domain/fare'
import { calculateRideProgress, type RideStatus } from '@/domain/ride'

type Identifier = number

type RouteData = {
  id: Identifier
  isActive: boolean
  pickupLabel: string
  destinationLabel: string
  totalDistanceMeters: number
  estimatedDurationSeconds: number
}

type TariffData = FareRules & {
  id: Identifier
  currency: string
  isActive: boolean
  validFrom: string
  validUntil?: string | null
}

type RideData = {
  id: Identifier
  reference: string
  status: RideStatus
  passenger: RelationshipValue
  driver?: RelationshipValue
  route: RelationshipValue
  tariff: RelationshipValue
  journey: {
    pickupLabel: string
    destinationLabel: string
    quotedDistanceMeters: number
    quotedDurationSeconds: number
    quotedFareCents: number
    startedAt?: string | null
    completedAt?: string | null
    cancelledAt?: string | null
    cancellationReason?: string | null
  }
  tariffSnapshot: FareRules & { currency: string }
  progress: {
    lastRouteSequence: number
    drivenDistanceMeters: number
    elapsedSeconds: number
    progressPercent: number
    currentFareCents: number
    estimatedFinalFareCents: number
    finalFareCents?: number | null
  }
}

type RoutePointData = {
  id: Identifier
  route: RelationshipValue
  sequence: number
  label: string
  latitude: number
  longitude: number
  distanceFromStartMeters: number
}

const asRide = (value: unknown): RideData => value as RideData
const asRoute = (value: unknown): RouteData => value as RouteData
const asTariff = (value: unknown): TariffData => value as TariffData
const asRoutePoint = (value: unknown): RoutePointData => value as RoutePointData

const jsonObject = async (req: PayloadRequest): Promise<Record<string, unknown>> => {
  if (!req.json) throw new APIError('JSON-aanvraag verwacht.', 400)
  const body: unknown = await req.json()
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new APIError('JSON-object verwacht.', 400)
  return body as Record<string, unknown>
}

const identifier = (value: unknown, name: string): Identifier => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value)
  throw new APIError(`${name} is verplicht.`, 400)
}

const relationNumber = (value: RelationshipValue, name: string): number => identifier(relationID(value), name)

const idempotencyKey = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(value)) {
    throw new APIError('Een idempotentiesleutel van 8 tot 100 letters, cijfers, _ of - is verplicht.', 400)
  }
  return value
}

const currentUser = (req: PayloadRequest): HitchUser => {
  if (!req.user) throw new APIError('Inloggen is verplicht.', 401)
  return req.user as HitchUser
}

const routeIsAvailable = (route: RouteData): boolean => route.isActive === true

const tariffIsAvailable = (tariff: TariffData, at: Date): boolean => {
  if (!tariff.isActive || new Date(tariff.validFrom) > at) return false
  return !tariff.validUntil || new Date(tariff.validUntil) >= at
}

const loadRoute = async (req: PayloadRequest, routeID: Identifier, requireActive = true): Promise<RouteData> => {
  try {
    const route = asRoute(await req.payload.findByID({ collection: 'routes', id: routeID, depth: 0, overrideAccess: true, req }))
    if (requireActive && !routeIsAvailable(route)) throw new APIError('Deze route is niet beschikbaar.', 400)
    return route
  } catch (error) {
    if (error instanceof APIError) throw error
    throw new APIError('Route niet gevonden.', 404)
  }
}

const loadActiveTariff = async (req: PayloadRequest, at = new Date()): Promise<TariffData> => {
  const result = await req.payload.find({
    collection: 'tariffs',
    where: { isActive: { equals: true } },
    sort: '-validFrom',
    limit: 50,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const tariff = result.docs.map(asTariff).find((candidate) => tariffIsAvailable(candidate, at))
  if (!tariff) throw new APIError('Er is geen actief tarief beschikbaar.', 409)
  return tariff
}

const createQuote = (route: RouteData, tariff: TariffData) => {
  const fare = calculateFare(route.totalDistanceMeters, route.estimatedDurationSeconds, tariff)
  return {
    route: {
      id: route.id,
      pickupLabel: route.pickupLabel,
      destinationLabel: route.destinationLabel,
      totalDistanceMeters: route.totalDistanceMeters,
      estimatedDurationSeconds: route.estimatedDurationSeconds,
    },
    tariff: { id: tariff.id, currency: tariff.currency },
    quote: {
      totalFareCents: fare.totalCents,
      distanceFareCents: fare.distanceFareCents,
      durationFareCents: fare.durationFareCents,
    },
  }
}

const ownRide = async (req: PayloadRequest, rideID: Identifier): Promise<RideData> => {
  currentUser(req)
  try {
    return asRide(await req.payload.findByID({
      collection: 'rides',
      id: rideID,
      depth: 0,
      user: req.user,
      overrideAccess: false,
      req,
    }))
  } catch {
    throw new APIError('Rit niet gevonden.', 404)
  }
}

const canOperateRide = (user: HitchUser, ride: RideData): boolean =>
  isOperator(user) || (isDriver(user) && String(relationID(ride.driver)) === String(user.id))

const createAudit = async (
  req: PayloadRequest,
  ride: RideData,
  action: 'ride_started' | 'ride_progressed' | 'ride_completed' | 'ride_cancelled',
  metadata: Record<string, unknown>,
): Promise<void> => {
  const actor = currentUser(req)
  await req.payload.create({
    collection: 'audit-logs',
    data: { action, ride: ride.id, actor: actor.id, metadata },
    overrideAccess: true,
    req,
  })
}

const existingEvent = async (req: PayloadRequest, key: string) => {
  const result = await req.payload.find({
    collection: 'ride-events',
    where: { idempotencyKey: { equals: key } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return result.docs[0]
}

const trackingResponse = (ride: RideData, points: RoutePointData[]) => ({
  ride: {
    id: ride.id,
    reference: ride.reference,
    status: ride.status,
    pickupLabel: ride.journey.pickupLabel,
    destinationLabel: ride.journey.destinationLabel,
    quotedFareCents: ride.journey.quotedFareCents,
    startedAt: ride.journey.startedAt,
    completedAt: ride.journey.completedAt,
    currency: ride.tariffSnapshot.currency,
    progress: ride.progress,
  },
  routePoints: points.map((point) => ({
    id: point.id,
    sequence: point.sequence,
    label: point.label,
    latitude: point.latitude,
    longitude: point.longitude,
    distanceFromStartMeters: point.distanceFromStartMeters,
    passed: point.sequence <= ride.progress.lastRouteSequence,
  })),
})

export const quoteEndpoint = {
  path: '/quote',
  method: 'post' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    const body = await jsonObject(req)
    const route = await loadRoute(req, identifier(body.routeId, 'routeId'))
    const tariff = await loadActiveTariff(req)
    return Response.json(createQuote(route, tariff))
  },
}

const startRide = {
  path: '/start',
  method: 'post' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    const user = currentUser(req)
    if (user.role !== 'passenger') throw new APIError('Alleen een passagier kan een eigen rit starten.', 403)
    const body = await jsonObject(req)
    const requestKey = idempotencyKey(body.idempotencyKey)
    const duplicate = await req.payload.find({
      collection: 'rides',
      where: { startRequestId: { equals: requestKey } },
      limit: 1,
      depth: 0,
      user: req.user,
      overrideAccess: false,
      req,
    })
    if (duplicate.docs[0]) return Response.json({ ride: asRide(duplicate.docs[0]), idempotent: true })

    const route = await loadRoute(req, identifier(body.routeId, 'routeId'))
    const pointCount = await req.payload.count({ collection: 'route-points', where: { route: { equals: route.id } }, overrideAccess: true, req })
    if (pointCount.totalDocs < 2) throw new APIError('Deze route heeft onvoldoende routepunten.', 409)
    const tariff = await loadActiveTariff(req)
    const quote = createQuote(route, tariff)
    const reference = `HT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const ride = asRide(await req.payload.create({
      collection: 'rides',
      data: {
        reference,
        startRequestId: requestKey,
        status: 'active',
        passenger: user.id,
        route: route.id,
        tariff: tariff.id,
        journey: {
          pickupLabel: route.pickupLabel,
          destinationLabel: route.destinationLabel,
          quotedDistanceMeters: route.totalDistanceMeters,
          quotedDurationSeconds: route.estimatedDurationSeconds,
          quotedFareCents: quote.quote.totalFareCents,
          startedAt: new Date().toISOString(),
        },
        tariffSnapshot: {
          currency: tariff.currency,
          startFareCents: tariff.startFareCents,
          pricePerKmCents: tariff.pricePerKmCents,
          pricePerMinuteCents: tariff.pricePerMinuteCents,
        },
        progress: {
          lastRouteSequence: 0,
          drivenDistanceMeters: 0,
          elapsedSeconds: 0,
          progressPercent: 0,
          currentFareCents: tariff.startFareCents,
          estimatedFinalFareCents: quote.quote.totalFareCents,
        },
      },
      overrideAccess: true,
      req,
    }))
    await createAudit(req, ride, 'ride_started', { routeId: route.id, tariffId: tariff.id })
    return Response.json({ ride, quote: quote.quote }, { status: 201 })
  },
}

const readTracking = {
  path: '/:id/tracking',
  method: 'get' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    const ride = await ownRide(req, identifier(req.routeParams?.id, 'Rit-id'))
    const routeID = relationNumber(ride.route, 'Route-id')
    const points = await req.payload.find({
      collection: 'route-points',
      where: { route: { equals: routeID } },
      sort: 'sequence',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      req,
    })
    return Response.json(trackingResponse(ride, points.docs.map(asRoutePoint)))
  },
}

const advanceRide = {
  path: '/:id/advance',
  method: 'post' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    const user = currentUser(req)
    const ride = await ownRide(req, identifier(req.routeParams?.id, 'Rit-id'))
    if (!canOperateRide(user, ride)) throw new APIError('Alleen de toegewezen chauffeur of een medewerker mag voortgang bijwerken.', 403)
    if (ride.status !== 'active') throw new APIError('Alleen een actieve rit kan voortgang ontvangen.', 409)
    const body = await jsonObject(req)
    const eventKey = idempotencyKey(body.idempotencyKey)
    if (await existingEvent(req, eventKey)) return Response.json({ ride, idempotent: true })
    const point = asRoutePoint(await req.payload.findByID({
      collection: 'route-points',
      id: identifier(body.routePointId, 'routePointId'),
      depth: 0,
      overrideAccess: true,
      req,
    }))
    if (String(relationID(point.route)) !== String(relationID(ride.route))) throw new APIError('Dit routepunt hoort niet bij deze rit.', 400)
    if (point.sequence <= ride.progress.lastRouteSequence) throw new APIError('De routevoortgang mag niet teruglopen of dubbel worden verwerkt.', 409)
    const route = await loadRoute(req, relationNumber(ride.route, 'Route-id'), false)
    const progress = calculateRideProgress({
      distanceMeters: point.distanceFromStartMeters,
      routeDistanceMeters: route.totalDistanceMeters,
      routeDurationSeconds: route.estimatedDurationSeconds,
      fareRules: ride.tariffSnapshot,
    })
    const updatedRide = asRide(await req.payload.update({
      collection: 'rides',
      id: ride.id,
      data: { progress: { lastRouteSequence: point.sequence, drivenDistanceMeters: point.distanceFromStartMeters, ...progress } },
      overrideAccess: true,
      req,
    }))
    await req.payload.create({
      collection: 'ride-events',
      data: {
        ride: ride.id,
        routePoint: point.id,
        idempotencyKey: eventKey,
        kind: 'progress',
        occurredAt: new Date().toISOString(),
        drivenDistanceMeters: point.distanceFromStartMeters,
        elapsedSeconds: progress.elapsedSeconds,
        currentFareCents: progress.currentFareCents,
        estimatedFinalFareCents: progress.estimatedFinalFareCents,
      },
      overrideAccess: true,
      req,
    })
    await createAudit(req, updatedRide, 'ride_progressed', { routePointId: point.id, sequence: point.sequence })
    return Response.json({ ride: updatedRide })
  },
}

const completeRide = {
  path: '/:id/complete',
  method: 'post' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    const user = currentUser(req)
    const ride = await ownRide(req, identifier(req.routeParams?.id, 'Rit-id'))
    if (!canOperateRide(user, ride)) throw new APIError('Alleen de toegewezen chauffeur of een medewerker mag een rit afronden.', 403)
    if (ride.status !== 'active') throw new APIError('Alleen een actieve rit kan worden afgerond.', 409)
    const body = await jsonObject(req)
    const eventKey = idempotencyKey(body.idempotencyKey)
    if (await existingEvent(req, eventKey)) return Response.json({ ride, idempotent: true })
    const finalPointResult = await req.payload.find({
      collection: 'route-points',
      where: { route: { equals: relationNumber(ride.route, 'Route-id') } },
      sort: '-sequence',
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    })
    const finalPoint = finalPointResult.docs[0] ? asRoutePoint(finalPointResult.docs[0]) : undefined
    if (!finalPoint || ride.progress.lastRouteSequence !== finalPoint.sequence) {
      throw new APIError('De rit kan pas worden afgerond nadat het laatste routepunt is bereikt.', 409)
    }
    const route = await loadRoute(req, relationNumber(ride.route, 'Route-id'), false)
    const finalFare = calculateFare(route.totalDistanceMeters, route.estimatedDurationSeconds, ride.tariffSnapshot).totalCents
    const updatedRide = asRide(await req.payload.update({
      collection: 'rides',
      id: ride.id,
      data: {
        status: 'completed',
        journey: { ...ride.journey, completedAt: new Date().toISOString() },
        progress: { ...ride.progress, drivenDistanceMeters: route.totalDistanceMeters, elapsedSeconds: route.estimatedDurationSeconds, progressPercent: 100, currentFareCents: finalFare, estimatedFinalFareCents: finalFare, finalFareCents: finalFare },
      },
      overrideAccess: true,
      req,
    }))
    await req.payload.create({
      collection: 'ride-events',
      data: { ride: ride.id, routePoint: finalPoint.id, idempotencyKey: eventKey, kind: 'completed', occurredAt: new Date().toISOString(), drivenDistanceMeters: route.totalDistanceMeters, elapsedSeconds: route.estimatedDurationSeconds, currentFareCents: finalFare, estimatedFinalFareCents: finalFare },
      overrideAccess: true,
      req,
    })
    await createAudit(req, updatedRide, 'ride_completed', { finalFareCents: finalFare })
    return Response.json({ ride: updatedRide })
  },
}

const cancelRide = {
  path: '/:id/cancel',
  method: 'post' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    const user = currentUser(req)
    const ride = await ownRide(req, identifier(req.routeParams?.id, 'Rit-id'))
    const isPassenger = String(relationID(ride.passenger)) === String(user.id)
    if (!isPassenger && !canOperateRide(user, ride)) throw new APIError('Je mag deze rit niet annuleren.', 403)
    if (ride.status !== 'quoted' && ride.status !== 'active') throw new APIError('Deze rit kan niet meer worden geannuleerd.', 409)
    const body = await jsonObject(req)
    const eventKey = idempotencyKey(body.idempotencyKey)
    if (await existingEvent(req, eventKey)) return Response.json({ ride, idempotent: true })
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : undefined
    const updatedRide = asRide(await req.payload.update({
      collection: 'rides',
      id: ride.id,
      data: { status: 'cancelled', journey: { ...ride.journey, cancelledAt: new Date().toISOString(), cancellationReason: reason } },
      overrideAccess: true,
      req,
    }))
    await req.payload.create({
      collection: 'ride-events',
      data: { ride: ride.id, idempotencyKey: eventKey, kind: 'cancelled', occurredAt: new Date().toISOString(), drivenDistanceMeters: ride.progress.drivenDistanceMeters, elapsedSeconds: ride.progress.elapsedSeconds, currentFareCents: ride.progress.currentFareCents, estimatedFinalFareCents: ride.progress.estimatedFinalFareCents, note: reason },
      overrideAccess: true,
      req,
    })
    await createAudit(req, updatedRide, 'ride_cancelled', { reason: reason ?? null })
    return Response.json({ ride: updatedRide })
  },
}

export const rideEndpoints = [startRide, readTracking, advanceRide, completeRide, cancelRide]
