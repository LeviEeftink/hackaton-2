import assert from 'node:assert/strict'
import { APIError, type PayloadRequest } from 'payload'

import { createReceiptCSV, csvCell } from '../src/domain/receipt'
import { historyEndpoints } from '../src/endpoints/history'

const [history, receipt] = historyEndpoints
const user = { id: 7, role: 'passenger' }
const ride = {
  id: 12,
  reference: 'HT-TEST-12',
  status: 'completed',
  passenger: 7,
  driver: 8,
  startRequestId: 'private-key',
  createdAt: '2026-10-02T12:00:00.000Z',
  journey: {
    pickupLabel: 'Station, "Centraal"',
    destinationLabel: '=HYPERLINK("https://example.invalid")',
    startedAt: '2026-10-02T12:00:00.000Z',
    completedAt: '2026-10-02T12:11:00.000Z',
    quotedFareCents: 1307,
  },
  tariffSnapshot: { currency: 'EUR', startFareCents: 350, pricePerKmCents: 220, pricePerMinuteCents: 35 },
  progress: { drivenDistanceMeters: 2600, elapsedSeconds: 660, progressPercent: 100, currentFareCents: 1500, estimatedFinalFareCents: 1500, finalFareCents: 1500 },
}

const request = (overrides: Record<string, unknown> = {}): PayloadRequest => ({
  user,
  query: {},
  routeParams: { id: '12' },
  ...overrides,
} as unknown as PayloadRequest)

const rejectsWith = async (work: Promise<unknown>, status: number) => {
  await assert.rejects(work, (error: unknown) => error instanceof APIError && error.status === status)
}

await rejectsWith(history.handler(request({ user: null })), 401)
await rejectsWith(receipt.handler(request({ user: null })), 401)

for (const query of [{ status: 'all' }, { status: ['completed'] }, { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '9007199254740992' }, { limit: '0' }, { limit: {} }]) {
  await rejectsWith(history.handler(request({ query })), 400)
}
for (const id of ['0', '-1', '1.5', '9007199254740992', '12\r\nInjected:yes']) {
  await rejectsWith(receipt.handler(request({ routeParams: { id } })), 400)
}

let findArgs: Record<string, unknown> | undefined
const find = async (args: Record<string, unknown>) => {
  findArgs = args
  return { docs: [ride], totalDocs: 51, totalPages: 2, page: args.page, limit: args.limit, hasNextPage: false, hasPrevPage: true, nextPage: null, prevPage: 1 }
}
const response = await history.handler(request({ query: { status: 'completed', page: '2', limit: '100' }, payload: { find } }))
assert.equal(findArgs?.overrideAccess, false)
assert.equal(findArgs?.user, user)
assert.equal(findArgs?.depth, 0)
assert.equal(findArgs?.limit, 50)
assert.equal(findArgs?.page, 2)
assert.deepEqual(findArgs?.where, { status: { equals: 'completed' } })
const result = await response.json()
assert.equal(result.docs[0].reference, ride.reference)
assert.equal(result.docs[0].progress.finalFareCents, 1500)
assert.equal(result.docs[0].currency, 'EUR')
assert.equal(result.docs[0].passenger, undefined)
assert.equal(result.docs[0].startRequestId, undefined)
assert.equal(result.docs[0].tariffSnapshot, undefined)
assert.equal(result.totalDocs, 51)
assert.equal(response.headers.get('Cache-Control'), 'private, no-store')

await history.handler(request({ payload: { find } }))
assert.equal(findArgs?.page, 1)
assert.equal(findArgs?.limit, 10)
assert.equal(findArgs?.where, undefined)

let receiptArgs: Record<string, unknown> | undefined
const receiptResponse = await receipt.handler(request({
  payload: {
    findByID: async (args: Record<string, unknown>) => { receiptArgs = args; return ride },
  },
}))
assert.equal(receiptArgs?.overrideAccess, false)
assert.equal(receiptArgs?.user, user)
assert.equal(receiptArgs?.id, 12)
assert.equal(receiptResponse.headers.get('Content-Type'), 'text/csv; charset=utf-8')
assert.equal(receiptResponse.headers.get('Content-Disposition'), 'attachment; filename="hitchtracker-rit-12-bewijs.csv"')
const bytes = new Uint8Array(await receiptResponse.arrayBuffer())
assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf])
const csv = new TextDecoder().decode(bytes)
assert.ok(csv.includes('"Station, ""Centraal"""'))
assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"")"'))
assert.ok(csv.includes('"Eindprijs (centen)","1500"'))
assert.ok(csv.includes('"Eindprijs","15.00"'))
assert.ok(csv.includes('"Tarief per kilometer (centen)","220"'))
assert.ok(!csv.includes('"1307"')) // Never substitute the old quote for the saved final amount.

await rejectsWith(receipt.handler(request({ payload: { findByID: async () => { throw new Error('Access denied') } } })), 404)
for (const status of ['quoted', 'active', 'cancelled']) {
  await rejectsWith(receipt.handler(request({ payload: { findByID: async () => ({ ...ride, status }) } })), 409)
}
for (const finalFareCents of [undefined, null, -1, 12.5, Number.NaN]) {
  await rejectsWith(receipt.handler(request({ payload: { findByID: async () => ({ ...ride, progress: { ...ride.progress, finalFareCents } }) } })), 409)
}
for (const value of ['=1+1', '+1+1', '-1+1', '@SUM(A1)', '  =1+1', '\tformula', '\rformula', '\nformula']) {
  assert.ok(csvCell(value).startsWith('"\''))
}
assert.equal(csvCell('Text\nwith "quotes"'), '"Text\nwith ""quotes"""')
assert.equal(csvCell('Centraal'), '"Centraal"')
assert.equal(csvCell(0), '"0"')
assert.throws(() => createReceiptCSV({ ...ride, progress: { ...ride.progress, finalFareCents: null } }), RangeError)
assert.ok(createReceiptCSV({ ...ride, progress: { ...ride.progress, finalFareCents: 0 } }).includes('"Eindprijs (centen)","0"'))

console.log('Ritgeschiedenis en CSV-ritbewijs: geslaagd')
