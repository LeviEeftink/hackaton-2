import assert from 'node:assert/strict'

import { calculateFare } from '../src/domain/fare'
import { calculateRideProgress, validStatusTransition } from '../src/domain/ride'

const rules = { startFareCents: 350, pricePerKmCents: 220, pricePerMinuteCents: 35 }

const fare = calculateFare(2600, 660, rules)
assert.equal(fare.distanceFareCents, 572)
assert.equal(fare.durationFareCents, 385)
assert.equal(fare.totalCents, 1307)

const halfway = calculateRideProgress({
  distanceMeters: 1300,
  routeDistanceMeters: 2600,
  routeDurationSeconds: 660,
  fareRules: rules,
})
assert.equal(halfway.elapsedSeconds, 330)
assert.equal(halfway.progressPercent, 50)
assert.equal(halfway.estimatedFinalFareCents, 1307)
assert.ok(halfway.currentFareCents < halfway.estimatedFinalFareCents)

assert.equal(validStatusTransition('quoted', 'active'), true)
assert.equal(validStatusTransition('active', 'completed'), true)
assert.equal(validStatusTransition('completed', 'active'), false)

console.log('Backend domeinregels: geslaagd')
