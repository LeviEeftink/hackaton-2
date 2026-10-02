import type { CollectionConfig } from 'payload'

import { adminsOnly, isOperator, operatorsOnly, type HitchUser } from '@/access/roles'

const nonNegative = (label: string) => (value: number | null | undefined) =>
  typeof value === 'number' && value >= 0 ? true : `${label} moet nul of hoger zijn.`

export const Tariffs: CollectionConfig = {
  slug: 'tariffs',
  labels: { singular: 'Tarief', plural: 'Tarieven' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'currency', 'isActive', 'validFrom', 'updatedAt'],
    group: 'Ritconfiguratie',
  },
  access: {
    create: operatorsOnly,
    read: ({ req }) => (isOperator(req.user as HitchUser | null) ? true : { isActive: { equals: true } }),
    update: operatorsOnly,
    delete: adminsOnly,
  },
  fields: [
    { name: 'name', type: 'text', label: 'Naam', required: true, unique: true, index: true, maxLength: 80 },
    {
      name: 'currency',
      type: 'select',
      label: 'Valuta',
      defaultValue: 'EUR',
      required: true,
      options: [{ label: 'Euro', value: 'EUR' }],
    },
    { name: 'startFareCents', type: 'number', label: 'Starttarief in centen', required: true, min: 0, validate: nonNegative('Starttarief') },
    { name: 'pricePerKmCents', type: 'number', label: 'Prijs per kilometer in centen', required: true, min: 0, validate: nonNegative('Prijs per kilometer') },
    { name: 'pricePerMinuteCents', type: 'number', label: 'Prijs per minuut in centen', required: true, min: 0, validate: nonNegative('Prijs per minuut') },
    { name: 'validFrom', type: 'date', label: 'Geldig vanaf', required: true, defaultValue: () => new Date().toISOString() },
    { name: 'validUntil', type: 'date', label: 'Geldig tot en met', admin: { date: { pickerAppearance: 'dayOnly' } } },
    { name: 'isActive', type: 'checkbox', label: 'Actief tarief', defaultValue: false, index: true },
    {
      name: 'rides',
      type: 'join',
      collection: 'rides',
      on: 'tariff',
      admin: { allowCreate: false, description: 'Ritten behouden een relatie met het gebruikte tarief.' },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.name && typeof data.name === 'string') data.name = data.name.trim().replace(/\s+/g, ' ')
        if (data?.validFrom && data?.validUntil && new Date(data.validUntil) < new Date(data.validFrom)) {
          throw new Error('De einddatum mag niet vóór de begindatum liggen.')
        }
        return data
      },
    ],
    beforeChange: [
      async ({ data, originalDoc, req }) => {
        if (data?.isActive !== true) return data

        const activeTariffs = await req.payload.find({
          collection: 'tariffs',
          where: { isActive: { equals: true } },
          limit: 10,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const otherActiveTariff = activeTariffs.docs.find((tariff) => String(tariff.id) !== String(originalDoc?.id))
        if (otherActiveTariff) {
          throw new Error('Deactiveer eerst het huidige tarief; er mag maar één actief tarief bestaan.')
        }
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const used = await req.payload.count({
          collection: 'rides',
          where: { tariff: { equals: id } },
          overrideAccess: true,
          req,
        })
        if (used.totalDocs > 0) throw new Error('Een gebruikt tarief kan niet worden verwijderd.')
      },
    ],
  },
  timestamps: true,
}
