import type { CollectionConfig } from 'payload'

import { adminsOnly, isOperator, operatorsOnly, relationID, type HitchUser } from '@/access/roles'
import { quoteEndpoint } from '@/endpoints/rides'

const wholePositiveNumber = (label: string) => (value: number | null | undefined) =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? true : `${label} moet een positief geheel getal zijn.`

export const Routes: CollectionConfig = {
  slug: 'routes',
  labels: { singular: 'Route', plural: 'Routes' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'pickupLabel', 'destinationLabel', 'totalDistanceMeters', 'isActive'],
    group: 'Ritconfiguratie',
    listSearchableFields: ['name', 'pickupLabel', 'destinationLabel'],
  },
  access: {
    create: operatorsOnly,
    read: ({ req }) => (isOperator(req.user as HitchUser | null) ? true : { isActive: { equals: true } }),
    update: operatorsOnly,
    delete: adminsOnly,
  },
  endpoints: [quoteEndpoint],
  fields: [
    { name: 'name', type: 'text', label: 'Routenaam', required: true, unique: true, index: true, maxLength: 120 },
    { name: 'pickupLabel', type: 'text', label: 'Vertrekpunt', required: true, maxLength: 160 },
    { name: 'destinationLabel', type: 'text', label: 'Bestemming', required: true, maxLength: 160 },
    { name: 'totalDistanceMeters', type: 'number', label: 'Totale afstand in meters', required: true, min: 1, validate: wholePositiveNumber('Totale afstand') },
    { name: 'estimatedDurationSeconds', type: 'number', label: 'Geschatte duur in seconden', required: true, min: 1, validate: wholePositiveNumber('Geschatte duur') },
    { name: 'isActive', type: 'checkbox', label: 'Beschikbaar in de demo', defaultValue: true, index: true },
    {
      name: 'routePoints',
      type: 'join',
      collection: 'route-points',
      on: 'route',
      admin: { allowCreate: true, defaultColumns: ['sequence', 'label', 'distanceFromStartMeters'] },
    },
    {
      name: 'rides',
      type: 'join',
      collection: 'rides',
      on: 'route',
      admin: { allowCreate: false },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        for (const key of ['name', 'pickupLabel', 'destinationLabel'] as const) {
          if (typeof data?.[key] === 'string') data[key] = data[key].trim().replace(/\s+/g, ' ')
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const used = await req.payload.count({ collection: 'rides', where: { route: { equals: id } }, overrideAccess: true, req })
        if (used.totalDocs > 0) throw new Error('Een route met ritten kan niet worden verwijderd.')
        const points = await req.payload.find({ collection: 'route-points', where: { route: { equals: id } }, limit: 1000, overrideAccess: true, req })
        for (const point of points.docs) {
          await req.payload.delete({ collection: 'route-points', id: point.id, overrideAccess: true, req })
        }
      },
    ],
  },
  timestamps: true,
}

export const RoutePoints: CollectionConfig = {
  slug: 'route-points',
  labels: { singular: 'Routepunt', plural: 'Routepunten' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['route', 'sequence', 'label', 'distanceFromStartMeters'],
    group: 'Ritconfiguratie',
  },
  defaultSort: 'sequence',
  access: {
    create: operatorsOnly,
    read: operatorsOnly,
    update: operatorsOnly,
    delete: adminsOnly,
  },
  fields: [
    { name: 'route', type: 'relationship', relationTo: 'routes', required: true, index: true },
    { name: 'sequence', type: 'number', label: 'Volgorde', required: true, min: 1, validate: wholePositiveNumber('Volgorde') },
    { name: 'label', type: 'text', label: 'Label', required: true, maxLength: 100 },
    { name: 'latitude', type: 'number', label: 'Breedtegraad', required: true, min: -90, max: 90 },
    { name: 'longitude', type: 'number', label: 'Lengtegraad', required: true, min: -180, max: 180 },
    { name: 'distanceFromStartMeters', type: 'number', label: 'Afstand vanaf start in meters', required: true, min: 0 },
  ],
  hooks: {
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        if (!data) return data
        if (typeof data.label === 'string') data.label = data.label.trim().replace(/\s+/g, ' ')
        const route = relationID(data.route)
        if (route === undefined || typeof data.sequence !== 'number') return data
        const duplicates = await req.payload.find({
          collection: 'route-points',
          where: { and: [{ route: { equals: route } }, { sequence: { equals: data.sequence } }] },
          limit: 2,
          overrideAccess: true,
          req,
        })
        const currentID = originalDoc?.id
        if (duplicates.docs.some((document) => String(document.id) !== String(currentID))) {
          throw new Error('De volgorde moet uniek zijn binnen één route.')
        }
        return data
      },
    ],
    beforeChange: [
      async ({ data, req }) => {
        if (!data) return data
        const routeID = relationID(data.route)
        if (routeID === undefined || typeof data.distanceFromStartMeters !== 'number') return data
        const route = await req.payload.findByID({ collection: 'routes', id: routeID, depth: 0, overrideAccess: true, req })
        if (data.distanceFromStartMeters > route.totalDistanceMeters) {
          throw new Error('Een routepunt kan niet verder liggen dan de totale routeafstand.')
        }
        return data
      },
    ],
  },
  timestamps: true,
}
