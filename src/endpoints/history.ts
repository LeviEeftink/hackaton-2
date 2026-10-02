import { APIError, type PayloadRequest } from 'payload'

import { createReceiptCSV, type ReceiptRide } from '@/domain/receipt'
import { rideStatuses, type RideStatus } from '@/domain/ride'

type HistoryRide = ReceiptRide & {
  status: RideStatus
  createdAt: string
  journey: ReceiptRide['journey'] & {
    quotedFareCents: number
    cancelledAt?: string | null
  }
  progress: ReceiptRide['progress'] & {
    progressPercent: number
    currentFareCents: number
    estimatedFinalFareCents: number
  }
}

const requireUser = (req: PayloadRequest): void => {
  if (!req.user) throw new APIError('Inloggen is verplicht.', 401)
}

const positiveInteger = (value: unknown, label: string, fallback?: number): number => {
  if (value === undefined && fallback !== undefined) return fallback
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) {
    throw new APIError(`${label} moet een positief geheel getal zijn.`, 400)
  }
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result <= 0) {
    throw new APIError(`${label} moet een positief geheel getal zijn.`, 400)
  }
  return result
}

const projectRide = (ride: HistoryRide) => ({
  id: ride.id,
  reference: ride.reference,
  status: ride.status,
  pickupLabel: ride.journey.pickupLabel,
  destinationLabel: ride.journey.destinationLabel,
  quotedFareCents: ride.journey.quotedFareCents,
  startedAt: ride.journey.startedAt ?? null,
  completedAt: ride.journey.completedAt ?? null,
  cancelledAt: ride.journey.cancelledAt ?? null,
  createdAt: ride.createdAt,
  currency: ride.tariffSnapshot.currency,
  progress: {
    drivenDistanceMeters: ride.progress.drivenDistanceMeters,
    elapsedSeconds: ride.progress.elapsedSeconds,
    progressPercent: ride.progress.progressPercent,
    currentFareCents: ride.progress.currentFareCents,
    estimatedFinalFareCents: ride.progress.estimatedFinalFareCents,
    finalFareCents: ride.progress.finalFareCents ?? null,
  },
})

const readHistory = {
  path: '/history',
  method: 'get' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    requireUser(req)
    const { status } = req.query ?? {}
    if (status !== undefined && (typeof status !== 'string' || !rideStatuses.includes(status as RideStatus))) {
      throw new APIError('Onbekende ritstatus.', 400)
    }
    const page = positiveInteger(req.query?.page, 'Pagina', 1)
    const limit = Math.min(50, positiveInteger(req.query?.limit, 'Paginagrootte', 10))
    const result = await req.payload.find({
      collection: 'rides',
      ...(status === undefined ? {} : { where: { status: { equals: status } } }),
      sort: '-createdAt',
      page,
      limit,
      depth: 0,
      user: req.user,
      overrideAccess: false,
      req,
      select: {
        reference: true,
        status: true,
        createdAt: true,
        journey: { pickupLabel: true, destinationLabel: true, quotedFareCents: true, startedAt: true, completedAt: true, cancelledAt: true },
        tariffSnapshot: { currency: true },
        progress: { drivenDistanceMeters: true, elapsedSeconds: true, progressPercent: true, currentFareCents: true, estimatedFinalFareCents: true, finalFareCents: true },
      },
    })
    return Response.json({
      docs: result.docs.map((ride) => projectRide(ride as unknown as HistoryRide)),
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      limit: result.limit,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      nextPage: result.nextPage,
      prevPage: result.prevPage,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  },
}

const downloadReceipt = {
  path: '/:id/receipt',
  method: 'get' as const,
  handler: async (req: PayloadRequest): Promise<Response> => {
    requireUser(req)
    const rideID = positiveInteger(req.routeParams?.id, 'Rit-id')
    let ride: HistoryRide
    try {
      ride = await req.payload.findByID({
        collection: 'rides',
        id: rideID,
        depth: 0,
        user: req.user,
        overrideAccess: false,
        req,
      }) as unknown as HistoryRide
    } catch {
      throw new APIError('Rit niet gevonden.', 404)
    }
    if (ride.status !== 'completed') throw new APIError('Een ritbewijs is beschikbaar nadat de rit is afgerond.', 409)
    const finalFare = ride.progress.finalFareCents
    if (typeof finalFare !== 'number' || !Number.isSafeInteger(finalFare) || finalFare < 0) {
      throw new APIError('De opgeslagen eindprijs ontbreekt of is ongeldig.', 409)
    }
    return new Response(createReceiptCSV(ride), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="hitchtracker-rit-${rideID}-bewijs.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  },
}

export const historyEndpoints = [readHistory, downloadReceipt]
