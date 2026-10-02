export type FareRules = {
  startFareCents: number
  pricePerKmCents: number
  pricePerMinuteCents: number
}

export type FareBreakdown = {
  distanceFareCents: number
  durationFareCents: number
  totalCents: number
}

const roundedCents = (value: number): number => Math.max(0, Math.round(value))

export const calculateFare = (
  distanceMeters: number,
  durationSeconds: number,
  rules: FareRules,
): FareBreakdown => {
  const distanceFareCents = roundedCents((Math.max(0, distanceMeters) / 1000) * rules.pricePerKmCents)
  const durationFareCents = roundedCents((Math.max(0, durationSeconds) / 60) * rules.pricePerMinuteCents)
  return {
    distanceFareCents,
    durationFareCents,
    totalCents: roundedCents(rules.startFareCents + distanceFareCents + durationFareCents),
  }
}

export const estimateDurationAtDistance = (
  distanceMeters: number,
  totalDistanceMeters: number,
  totalDurationSeconds: number,
): number => {
  if (totalDistanceMeters <= 0) return 0
  return Math.max(0, Math.round((Math.max(0, distanceMeters) / totalDistanceMeters) * totalDurationSeconds))
}

export const formatEuro = (cents: number): string =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
