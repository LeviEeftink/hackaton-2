import 'dotenv/config'

import type { SQLiteAdapter } from '@payloadcms/db-sqlite'
import { pathToFileURL } from 'node:url'
import { getPayload, type CollectionSlug, type Payload } from 'payload'

import config from '../src/payload.config'

type Identifier = number

const findOne = async (payload: Payload, collection: CollectionSlug, field: string, value: string) => {
  const result = await payload.find({ collection, where: { [field]: { equals: value } }, limit: 1, depth: 0, overrideAccess: true })
  return result.docs[0] as { id: Identifier } | undefined
}

export const seedDemoData = async (payload: Payload) => {
  const password = 'HitchTrackerDemo2026!'

  const ensureUser = async (name: string, email: string, role: 'passenger' | 'driver' | 'operator' | 'admin') => {
    const existing = await findOne(payload, 'users', 'email', email)
    if (existing) return existing
    return payload.create({
      collection: 'users',
      data: { name, email, password, role },
      context: { allowPrivilegedRole: true },
      overrideAccess: true,
    }) as Promise<{ id: Identifier }>
  }

  const admin = await ensureUser('HitchTracker Beheer', 'admin@hitchtracker.test', 'admin')
  const passenger = await ensureUser('Demo Passagier', 'passenger@hitchtracker.test', 'passenger')
  const driver = await ensureUser('Demo Chauffeur', 'driver@hitchtracker.test', 'driver')
  await ensureUser('Demo Medewerker', 'operator@hitchtracker.test', 'operator')

  let tariff = await findOne(payload, 'tariffs', 'name', 'Standaard tarief')
  if (!tariff) {
    tariff = await payload.create({
      collection: 'tariffs',
      data: { name: 'Standaard tarief', currency: 'EUR', startFareCents: 350, pricePerKmCents: 220, pricePerMinuteCents: 35, validFrom: new Date().toISOString(), isActive: true },
      overrideAccess: true,
    }) as { id: Identifier }
  }

  let vehicle = await findOne(payload, 'vehicles', 'licensePlate', 'HT-2026')
  if (!vehicle) {
    vehicle = await payload.create({
      collection: 'vehicles',
      data: { licensePlate: 'HT-2026', makeModel: 'Demo Taxi Electric', seatCount: 4, isActive: true, currentDriver: driver.id },
      overrideAccess: true,
    }) as { id: Identifier }
  }

  const demoRoutes = [
    {
      name: 'Amsterdam Centraal naar Museumplein',
      pickupLabel: 'Amsterdam Centraal',
      destinationLabel: 'Museumplein',
      totalDistanceMeters: 2600,
      estimatedDurationSeconds: 660,
      points: [
        { sequence: 1, label: 'Amsterdam Centraal', latitude: 52.3780, longitude: 4.9000, distanceFromStartMeters: 0 },
        { sequence: 2, label: 'Dam', latitude: 52.3731, longitude: 4.8923, distanceFromStartMeters: 700 },
        { sequence: 3, label: 'Leidseplein', latitude: 52.3644, longitude: 4.8811, distanceFromStartMeters: 1750 },
        { sequence: 4, label: 'Museumplein', latitude: 52.3580, longitude: 4.8812, distanceFromStartMeters: 2600 },
      ],
    },
    {
      name: 'Amsterdam Centraal naar Schiphol',
      pickupLabel: 'Amsterdam Centraal',
      destinationLabel: 'Schiphol',
      totalDistanceMeters: 17000,
      estimatedDurationSeconds: 1500,
      points: [
        { sequence: 1, label: 'Amsterdam Centraal', latitude: 52.3780, longitude: 4.9000, distanceFromStartMeters: 0 },
        { sequence: 2, label: 'De Pijp', latitude: 52.3550, longitude: 4.8930, distanceFromStartMeters: 2800 },
        { sequence: 3, label: 'Station Zuid', latitude: 52.3390, longitude: 4.8730, distanceFromStartMeters: 6500 },
        { sequence: 4, label: 'Schiphol', latitude: 52.3105, longitude: 4.7683, distanceFromStartMeters: 17000 },
      ],
    },
    {
      name: 'Leidseplein naar Zuidas',
      pickupLabel: 'Leidseplein',
      destinationLabel: 'Zuidas',
      totalDistanceMeters: 7200,
      estimatedDurationSeconds: 900,
      points: [
        { sequence: 1, label: 'Leidseplein', latitude: 52.3644, longitude: 4.8811, distanceFromStartMeters: 0 },
        { sequence: 2, label: 'Museumplein', latitude: 52.3580, longitude: 4.8812, distanceFromStartMeters: 900 },
        { sequence: 3, label: 'De Pijp', latitude: 52.3550, longitude: 4.8930, distanceFromStartMeters: 2600 },
        { sequence: 4, label: 'Station Zuid', latitude: 52.3390, longitude: 4.8730, distanceFromStartMeters: 5900 },
        { sequence: 5, label: 'Zuidas', latitude: 52.3370, longitude: 4.8720, distanceFromStartMeters: 7200 },
      ],
    },
    {
      name: 'Jordaan naar Artis',
      pickupLabel: 'Jordaan',
      destinationLabel: 'Artis',
      totalDistanceMeters: 3400,
      estimatedDurationSeconds: 780,
      points: [
        { sequence: 1, label: 'Jordaan', latitude: 52.3700, longitude: 4.8830, distanceFromStartMeters: 0 },
        { sequence: 2, label: 'Dam', latitude: 52.3731, longitude: 4.8923, distanceFromStartMeters: 1200 },
        { sequence: 3, label: 'Nieuwmarkt', latitude: 52.3720, longitude: 4.9010, distanceFromStartMeters: 2100 },
        { sequence: 4, label: 'Artis', latitude: 52.3660, longitude: 4.9160, distanceFromStartMeters: 3400 },
      ],
    },
  ]

  for (const demoRoute of demoRoutes) {
    let route = await findOne(payload, 'routes', 'name', demoRoute.name)
    if (!route) {
      route = await payload.create({
        collection: 'routes',
        data: {
          name: demoRoute.name,
          pickupLabel: demoRoute.pickupLabel,
          destinationLabel: demoRoute.destinationLabel,
          totalDistanceMeters: demoRoute.totalDistanceMeters,
          estimatedDurationSeconds: demoRoute.estimatedDurationSeconds,
          isActive: true,
        },
        overrideAccess: true,
      }) as { id: Identifier }
    }
    for (const point of demoRoute.points) {
      const existingPoint = await payload.find({
        collection: 'route-points',
        where: { and: [{ route: { equals: route.id } }, { sequence: { equals: point.sequence } }] },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      })
      if (!existingPoint.docs[0]) {
        await payload.create({ collection: 'route-points', data: { route: route.id, ...point }, overrideAccess: true })
      }
    }
    if (!await findOne(payload, 'destinations', 'name', demoRoute.destinationLabel)) {
      await payload.create({
        collection: 'destinations',
        data: { name: demoRoute.destinationLabel, isActive: true },
        overrideAccess: true,
      })
    }
  }

  const route = await findOne(payload, 'routes', 'name', 'Amsterdam Centraal naar Museumplein')
  return { admin, passenger, driver, tariff, vehicle, route }
}

const main = async () => {
  const payload = await getPayload({ config })
  try {
    const { admin, passenger, tariff, vehicle, route } = await seedDemoData(payload)
    const password = 'HitchTrackerDemo2026!'
    console.log('Seed voltooid.')
    console.table([
      { rol: 'admin', email: 'admin@hitchtracker.test', wachtwoord: password },
      { rol: 'passenger', email: 'passenger@hitchtracker.test', wachtwoord: password },
      { rol: 'driver', email: 'driver@hitchtracker.test', wachtwoord: password },
      { rol: 'operator', email: 'operator@hitchtracker.test', wachtwoord: password },
    ])
    console.log(`Demo route id: ${route?.id}; tarief id: ${tariff.id}; voertuig id: ${vehicle.id}; admin id: ${admin.id}; passagier id: ${passenger.id}`)
  } finally {
    const client = (payload.db as unknown as SQLiteAdapter).client
    await payload.destroy()
    client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
