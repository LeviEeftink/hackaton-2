import 'dotenv/config'
import assert from 'node:assert/strict'

import { getPayload } from 'payload'

import config from '../src/payload.config'

const payload = await getPayload({ config })

const [users, tariffs, vehicles, routes, routePoints] = await Promise.all([
  payload.count({ collection: 'users', overrideAccess: true }),
  payload.count({ collection: 'tariffs', overrideAccess: true }),
  payload.count({ collection: 'vehicles', overrideAccess: true }),
  payload.count({ collection: 'routes', overrideAccess: true }),
  payload.count({ collection: 'route-points', overrideAccess: true }),
])

assert.ok(users.totalDocs >= 4, 'De seed moet vier demo-gebruikers bevatten.')
assert.equal(tariffs.totalDocs, 1, 'De seed moet één actief tarief bevatten.')
assert.equal(vehicles.totalDocs, 1, 'De seed moet één voertuig bevatten.')
assert.equal(routes.totalDocs, 1, 'De seed moet één demo-route bevatten.')
assert.equal(routePoints.totalDocs, 4, 'De demo-route moet vier geordende routepunten bevatten.')

console.log('Seed-relaties: geslaagd')
