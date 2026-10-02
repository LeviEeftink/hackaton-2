import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import type { SQLiteAdapter } from '@payloadcms/db-sqlite'
import { getPayload, type CollectionSlug } from 'payload'

// Shared cache keeps Payload's transaction connections in the same isolated memory database.
// The developer's DATABASE_URL and local .env are never used for this test.
process.env.DATABASE_URL = 'file::memory:?cache=shared'
process.env.PAYLOAD_SECRET = `hitchtracker-seed-integration-${randomUUID()}`

const [{ default: config }, { seedDemoData }] = await Promise.all([
  import('../src/payload.config'),
  import('../scripts/seed'),
])
const payload = await getPayload({ config })

const collections: CollectionSlug[] = ['users', 'tariffs', 'vehicles', 'routes', 'route-points', 'destinations']
const fixtureCounts = async () => Promise.all(collections.map(async (collection) => {
  const result = await payload.count({ collection, overrideAccess: true })
  return result.totalDocs
}))

try {
  const firstSeed = await seedDemoData(payload)
  assert.deepEqual(await fixtureCounts(), [4, 1, 1, 4, 17, 4], 'Een lege database krijgt alle vier demo-routes en zeventien punten.')

  const expectedRoutes = [
    { name: 'Amsterdam Centraal naar Museumplein', pointCount: 4, distance: 2600 },
    { name: 'Amsterdam Centraal naar Schiphol', pointCount: 4, distance: 17000 },
    { name: 'Leidseplein naar Zuidas', pointCount: 5, distance: 7200 },
    { name: 'Jordaan naar Artis', pointCount: 4, distance: 3400 },
  ]
  const routes = await payload.find({ collection: 'routes', limit: 100, depth: 0, overrideAccess: true })
  for (const expected of expectedRoutes) {
    const route = routes.docs.find((candidate) => candidate.name === expected.name)
    assert.ok(route, `Demo-route ontbreekt: ${expected.name}`)
    const points = await payload.find({
      collection: 'route-points',
      where: { route: { equals: route.id } },
      sort: 'sequence',
      limit: 100,
      depth: 0,
      overrideAccess: true,
    })
    assert.equal(points.totalDocs, expected.pointCount)
    assert.deepEqual(points.docs.map((point) => point.sequence), Array.from({ length: expected.pointCount }, (_, index) => index + 1))
    assert.equal(points.docs[0].distanceFromStartMeters, 0)
    assert.equal(points.docs.at(-1)?.distanceFromStartMeters, expected.distance)
    assert.ok(points.docs.every((point, index) => index === 0 || point.distanceFromStartMeters > points.docs[index - 1].distanceFromStartMeters))
  }

  const users = await payload.find({ collection: 'users', limit: 100, depth: 0, overrideAccess: true })
  for (const role of ['admin', 'passenger', 'driver', 'operator']) {
    assert.equal(users.docs.find((user) => user.email === `${role}@hitchtracker.test`)?.role, role)
  }
  const vehicle = await payload.findByID({ collection: 'vehicles', id: firstSeed.vehicle.id, depth: 0, overrideAccess: true })
  assert.equal(vehicle.currentDriver, firstSeed.driver.id)

  const repeatedSeed = await seedDemoData(payload)
  assert.deepEqual(await fixtureCounts(), [4, 1, 1, 4, 17, 4], 'Opnieuw seeden maakt geen dubbele fixtures.')
  assert.deepEqual(
    Object.values(repeatedSeed).map((fixture) => fixture?.id),
    Object.values(firstSeed).map((fixture) => fixture?.id),
    'Bestaande fixture-identiteiten blijven behouden.',
  )

  // Reproduce the previous failure: Museumplein exists while other routes and one point are missing.
  for (const name of ['Amsterdam Centraal naar Schiphol', 'Jordaan naar Artis']) {
    const route = routes.docs.find((candidate) => candidate.name === name)
    assert.ok(route)
    await payload.delete({ collection: 'routes', id: route.id, overrideAccess: true })
  }
  const museumRoute = firstSeed.route
  assert.ok(museumRoute)
  const missingPoint = await payload.find({
    collection: 'route-points',
    where: { and: [{ route: { equals: museumRoute.id } }, { sequence: { equals: 2 } }] },
    limit: 1,
    overrideAccess: true,
  })
  await payload.delete({ collection: 'route-points', id: missingPoint.docs[0].id, overrideAccess: true })
  const destination = await payload.find({ collection: 'destinations', where: { name: { equals: 'Artis' } }, limit: 1, overrideAccess: true })
  await payload.delete({ collection: 'destinations', id: destination.docs[0].id, overrideAccess: true })

  await payload.update({ collection: 'users', id: firstSeed.passenger.id, data: { name: 'Aangepaste demo-passagier' }, overrideAccess: true })
  const customRoute = await payload.create({
    collection: 'routes',
    data: { name: 'Eigen route', pickupLabel: 'Thuis', destinationLabel: 'Werk', totalDistanceMeters: 1000, estimatedDurationSeconds: 300, isActive: false },
    overrideAccess: true,
  })
  await seedDemoData(payload)
  assert.deepEqual(await fixtureCounts(), [4, 1, 1, 5, 17, 4], 'Ontbrekende routes, punten en bestemmingen worden hersteld naast eigen data.')
  const restoredPoint = await payload.find({
    collection: 'route-points',
    where: { and: [{ route: { equals: museumRoute.id } }, { sequence: { equals: 2 } }] },
    limit: 1,
    overrideAccess: true,
  })
  assert.equal(restoredPoint.totalDocs, 1)
  assert.equal(restoredPoint.docs[0].label, 'Dam')
  const preservedPassenger = await payload.findByID({ collection: 'users', id: firstSeed.passenger.id, overrideAccess: true })
  assert.equal(preservedPassenger.name, 'Aangepaste demo-passagier', 'Seeden overschrijft bestaande gebruikers niet.')
  assert.equal((await payload.findByID({ collection: 'routes', id: customRoute.id, overrideAccess: true })).isActive, false)
  await seedDemoData(payload)
  assert.deepEqual(await fixtureCounts(), [4, 1, 1, 5, 17, 4], 'Ook na reparatie blijft opnieuw seeden idempotent.')

  console.log('Seed-relaties, herhaalbaarheid en herstel: geslaagd')
} finally {
  const client = (payload.db as unknown as SQLiteAdapter).client
  await payload.destroy()
  client.close()
}
