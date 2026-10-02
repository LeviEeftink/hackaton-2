import type { CollectionConfig } from 'payload'

import { adminsOnly, isDriver, isOperator, operatorsOnly, type HitchUser } from '@/access/roles'

export const Vehicles: CollectionConfig = {
  slug: 'vehicles',
  labels: { singular: 'Voertuig', plural: 'Voertuigen' },
  admin: {
    useAsTitle: 'licensePlate',
    defaultColumns: ['licensePlate', 'makeModel', 'currentDriver', 'isActive'],
    group: 'Operations',
  },
  access: {
    create: operatorsOnly,
    read: ({ req }) => {
      const user = req.user as HitchUser | null
      if (!user) return false
      if (isOperator(user)) return true
      if (isDriver(user)) return { currentDriver: { equals: user.id } }
      return false
    },
    update: operatorsOnly,
    delete: adminsOnly,
  },
  fields: [
    { name: 'licensePlate', type: 'text', label: 'Kenteken', required: true, unique: true, index: true, maxLength: 20 },
    { name: 'makeModel', type: 'text', label: 'Merk en model', required: true, maxLength: 100 },
    { name: 'seatCount', type: 'number', label: 'Aantal zitplaatsen', required: true, min: 1, max: 9, defaultValue: 4 },
    { name: 'isActive', type: 'checkbox', label: 'Inzetbaar', defaultValue: true },
    {
      name: 'currentDriver',
      type: 'relationship',
      relationTo: 'users',
      filterOptions: { role: { equals: 'driver' } },
      admin: { description: 'Optionele actuele chauffeur.' },
    },
    { name: 'rides', type: 'join', collection: 'rides', on: 'vehicle', admin: { allowCreate: false } },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.licensePlate === 'string') data.licensePlate = data.licensePlate.trim().toUpperCase().replace(/\s+/g, '-')
        if (typeof data.makeModel === 'string') data.makeModel = data.makeModel.trim().replace(/\s+/g, ' ')
        return data
      },
    ],
    beforeDelete: [
      async ({ id, req }) => {
        const used = await req.payload.count({ collection: 'rides', where: { vehicle: { equals: id } }, overrideAccess: true, req })
        if (used.totalDocs > 0) throw new Error('Een voertuig met ritten kan niet worden verwijderd.')
      },
    ],
  },
  timestamps: true,
}
