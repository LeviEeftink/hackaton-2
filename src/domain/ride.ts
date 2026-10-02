import { calculateFare, estimateDurationAtDistance, type FareRules } from './fare'

export const rideStatuses = ['quoted', 'active', 'completed', 'cancelled'] as const
export type RideStatus = (typeof rideStatuses)[number]

export const validStatusTransition = (from: RideStatus, to: RideStatus): boolean => {
  const allowed: Record<RideStatus, RideStatus[]> = {
    quoted: ['active', 'cancelled'],
    active: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
  }
  return allowed[from].includes(to)
}

export const calculateRideProgress = ({
  distanceMeters,
  routeDistanceMeters,
  routeDurationSeconds,
  fareRules,
}: {
  distanceMeters: number
  routeDistanceMeters: number
  routeDurationSeconds: number
  fareRules: FareRules
}) => {
  const elapsedSeconds = estimateDurationAtDistance(distanceMeters, routeDistanceMeters, routeDurationSeconds)
  const currentFare = calculateFare(distanceMeters, elapsedSeconds, fareRules)
  const finalFare = calculateFare(routeDistanceMeters, routeDurationSeconds, fareRules)
  return {
    elapsedSeconds,
    currentFareCents: currentFare.totalCents,
    estimatedFinalFareCents: finalFare.totalCents,
    progressPercent: Math.min(100, Math.round((distanceMeters / routeDistanceMeters) * 10000) / 100),
  }
}
