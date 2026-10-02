import type { CollectionConfig } from 'payload'

import { adminsOnly, isOperator, operatorsOnly, type HitchUser } from '@/access/roles'

export const Destinations: CollectionConfig = {
  slug: 'destinations',
  labels: { singular: 'Bestemming', plural: 'Bestemmingen' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'isActive', 'updatedAt'],
    group: 'Ritconfiguratie',
  },
  access: {
    create: operatorsOnly,
    read: () => true,
    update: operatorsOnly,
    delete: adminsOnly,
  },
  fields: [
    { name: 'name', type: 'text', label: 'Naam', required: true, unique: true, index: true, maxLength: 120 },
    { name: 'isActive', type: 'checkbox', label: 'Beschikbaar in de demo', defaultValue: true, index: true },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.name && typeof data.name === 'string') data.name = data.name.trim().replace(/\s+/g, ' ')
        return data
      },
    ],
  },
  timestamps: true,
}
