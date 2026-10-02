import type { CollectionConfig } from 'payload'

import { adminsOnly, isOperator, operatorsOnly, relationID, rideEventReadAccess, rideReadAccess, type HitchUser } from '@/access/roles'
import { validStatusTransition, type RideStatus } from '@/domain/ride'
import { rideEndpoints } from '@/endpoints/rides'
import { historyEndpoints } from '@/endpoints/history'

const positiveInteger = (label: string) => (value: number | null | undefined) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? true : `${label} moet een niet-negatief geheel getal zijn.`

export const Rides: CollectionConfig = {
  slug: 'rides',
  labels: { singular: 'Rit', plural: 'Ritten' },
  admin: {
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'passenger', 'status', 'currentFareCents', 'estimatedFinalFareCents', 'startedAt'],
    group: 'Ritten',
  },
  defaultSort: '-createdAt',
  access: {
    create: operatorsOnly,
    read: rideReadAccess,
    update: operatorsOnly,
    delete: adminsOnly,
  },
  endpoints: [...historyEndpoints, ...rideEndpoints],
  fields: [
    { name: 'reference', type: 'text', label: 'Ritnummer', required: true, unique: true, index: true, maxLength: 40 },
    { name: 'startRequestId', type: 'text', label: 'Start-idempotentiesleutel', unique: true, index: true, maxLength: 100, admin: { readOnly: true } },
    {
      name: 'status',
      type: 'select',
      label: 'Status',
      required: true,
      defaultValue: 'quoted',
      index: true,
      options: [
        { label: 'Prijsvoorstel', value: 'quoted' },
        { label: 'Bezig', value: 'active' },
        { label: 'Afgerond', value: 'completed' },
        { label: 'Geannuleerd', value: 'cancelled' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'passenger', type: 'relationship', relationTo: 'users', required: true, index: true, filterOptions: { role: { equals: 'passenger' } }, admin: { width: '50%' } },
        { name: 'driver', type: 'relationship', relationTo: 'users', index: true, filterOptions: { role: { equals: 'driver' } }, admin: { width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'vehicle', type: 'relationship', relationTo: 'vehicles', admin: { width: '50%' } },
        { name: 'route', type: 'relationship', relationTo: 'routes', required: true, index: true, admin: { width: '50%' } },
      ],
    },
    { name: 'tariff', type: 'relationship', relationTo: 'tariffs', required: true, index: true },
    {
      name: 'journey',
      type: 'group',
      label: 'Ritgegevens',
      fields: [
        { name: 'pickupLabel', type: 'text', required: true, maxLength: 160 },
        { name: 'destinationLabel', type: 'text', required: true, maxLength: 160 },
        { name: 'quotedDistanceMeters', type: 'number', required: true, min: 1, validate: positiveInteger('Geschatte afstand') },
        { name: 'quotedDurationSeconds', type: 'number', required: true, min: 1, validate: positiveInteger('Geschatte duur') },
        { name: 'quotedFareCents', type: 'number', required: true, min: 0, validate: positiveInteger('Geschatte prijs') },
        { name: 'startedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'completedAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'cancelledAt', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'cancellationReason', type: 'textarea', maxLength: 500 },
      ],
    },
    {
      name: 'tariffSnapshot',
      type: 'group',
      label: 'Tariefmomentopname',
      fields: [
        { name: 'currency', type: 'text', required: true, defaultValue: 'EUR', maxLength: 3 },
        { name: 'startFareCents', type: 'number', required: true, min: 0 },
        { name: 'pricePerKmCents', type: 'number', required: true, min: 0 },
        { name: 'pricePerMinuteCents', type: 'number', required: true, min: 0 },
      ],
    },
    {
      name: 'progress',
      type: 'group',
      label: 'Server-side voortgang',
      fields: [
        { name: 'lastRouteSequence', type: 'number', required: true, defaultValue: 0, min: 0, validate: positiveInteger('Laatste routevolgorde') },
        { name: 'drivenDistanceMeters', type: 'number', required: true, defaultValue: 0, min: 0, validate: positiveInteger('Gereden afstand') },
        { name: 'elapsedSeconds', type: 'number', required: true, defaultValue: 0, min: 0, validate: positiveInteger('Verstreken seconden') },
        { name: 'progressPercent', type: 'number', required: true, defaultValue: 0, min: 0, max: 100 },
        { name: 'currentFareCents', type: 'number', required: true, defaultValue: 0, min: 0, validate: positiveInteger('Actuele prijs') },
        { name: 'estimatedFinalFareCents', type: 'number', required: true, defaultValue: 0, min: 0, validate: positiveInteger('Geschatte eindprijs') },
        { name: 'finalFareCents', type: 'number', min: 0, validate: (value: number | null | undefined) => value === undefined || value === null || Number.isInteger(value) || 'De eindprijs moet een geheel aantal centen zijn.' },
      ],
    },
    {
      name: 'events',
      type: 'join',
      collection: 'ride-events',
      on: 'ride',
      admin: { allowCreate: false, defaultColumns: ['kind', 'routePoint', 'occurredAt', 'currentFareCents'] },
    },
    { name: 'auditLogs', type: 'join', collection: 'audit-logs', on: 'ride', admin: { allowCreate: false } },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.reference === 'string') data.reference = data.reference.trim().toUpperCase()
        if (typeof data.startRequestId === 'string') data.startRequestId = data.startRequestId.trim()
        return data
      },
    ],
    beforeChange: [
      ({ data, operation, originalDoc }) => {
        if (operation !== 'update' || !data?.status || !originalDoc?.status) return data
        const from = originalDoc.status as RideStatus
        const to = data.status as RideStatus
        if (from !== to && !validStatusTransition(from, to)) {
          throw new Error(`Ongeldige statusovergang van ${from} naar ${to}.`)
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const eventCount = await req.payload.count({ collection: 'ride-events', where: { ride: { equals: id } }, overrideAccess: true, req })
        if (eventCount.totalDocs > 0) throw new Error('Een rit met vastgelegde voortgang kan niet worden verwijderd.')
      },
    ],
  },
  timestamps: true,
}

export const RideEvents: CollectionConfig = {
  slug: 'ride-events',
  labels: { singular: 'Ritmoment', plural: 'Ritmomenten' },
  admin: {
    useAsTitle: 'idempotencyKey',
    defaultColumns: ['ride', 'kind', 'routePoint', 'occurredAt', 'currentFareCents'],
    group: 'Ritten',
  },
  defaultSort: '-occurredAt',
  access: {
    create: operatorsOnly,
    read: rideEventReadAccess,
    update: () => false,
    delete: adminsOnly,
  },
  fields: [
    { name: 'ride', type: 'relationship', relationTo: 'rides', required: true, index: true },
    { name: 'routePoint', type: 'relationship', relationTo: 'route-points' },
    { name: 'idempotencyKey', type: 'text', label: 'Idempotentiesleutel', required: true, unique: true, index: true, maxLength: 100 },
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: [
        { label: 'Voortgang', value: 'progress' },
        { label: 'Afgerond', value: 'completed' },
        { label: 'Geannuleerd', value: 'cancelled' },
      ],
    },
    { name: 'occurredAt', type: 'date', required: true, defaultValue: () => new Date().toISOString(), index: true, admin: { date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'drivenDistanceMeters', type: 'number', required: true, min: 0 },
    { name: 'elapsedSeconds', type: 'number', required: true, min: 0 },
    { name: 'currentFareCents', type: 'number', required: true, min: 0 },
    { name: 'estimatedFinalFareCents', type: 'number', required: true, min: 0 },
    { name: 'note', type: 'text', maxLength: 250 },
  ],
  timestamps: true,
}
