export type SessionUser = { id: number; name: string; email: string; role: 'passenger' | 'driver' | 'operator' | 'admin' }

export type RouteOption = {
  id: number; name: string; pickupLabel: string; destinationLabel: string
  totalDistanceMeters: number; estimatedDurationSeconds: number; isActive: boolean
}

export type Quote = {
  route: Omit<RouteOption, 'name' | 'isActive'>
  tariff: { id: number; currency: string }
  quote: { totalFareCents: number; distanceFareCents: number; durationFareCents: number }
}

export type TrackedRide = {
  id: number; reference: string; status: 'quoted' | 'active' | 'completed' | 'cancelled'
  pickupLabel: string; destinationLabel: string; quotedFareCents: number; currency: string
  startedAt?: string | null; completedAt?: string | null
  progress: {
    lastRouteSequence: number; drivenDistanceMeters: number; elapsedSeconds: number
    progressPercent: number; currentFareCents: number; estimatedFinalFareCents: number; finalFareCents?: number | null
  }
}

export type Tracking = {
  ride: TrackedRide
  routePoints: { id: number; sequence: number; label: string; latitude: number; longitude: number; distanceFromStartMeters: number; passed: boolean }[]
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options, credentials: 'same-origin', cache: 'no-store',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.errors?.[0]?.message || data?.message || 'De aanvraag is niet gelukt. Probeer opnieuw.')
  }
  return data as T
}

export const money = (cents: number, currency = 'EUR') =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(cents / 100)
export const distance = (meters: number) => `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(meters / 1000)} km`
export const minutes = (seconds: number) => `${Math.ceil(seconds / 60)} min`
export const dateTime = (date?: string | null) => date ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date)) : '—'
export const statusLabel = (status: TrackedRide['status']) => ({ quoted: 'Voorstel', active: 'Onderweg', completed: 'Afgerond', cancelled: 'Geannuleerd' })[status]
