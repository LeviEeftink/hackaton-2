import type { CollectionConfig } from 'payload'

import { adminsOnly, isOperator, ownUserOrOperator, ownUserOrOperatorField, type HitchUser } from '@/access/roles'

const normalizeName = (value: string): string => value.trim().replace(/\s+/g, ' ')

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Gebruiker', plural: 'Gebruikers' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role', 'phone', 'updatedAt'],
    group: 'Toegang',
  },
  auth: {
    lockTime: 15 * 60 * 1000,
    maxLoginAttempts: 5,
    tokenExpiration: 60 * 60 * 24,
    verify: false,
  },
  access: {
    admin: ({ req }) => isOperator(req.user as HitchUser | null),
    create: () => true,
    read: ownUserOrOperator,
    update: ownUserOrOperator,
    delete: adminsOnly,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      label: 'Volledige naam',
      required: true,
      minLength: 2,
      maxLength: 120,
      access: { update: ownUserOrOperatorField },
    },
    {
      name: 'role',
      type: 'select',
      label: 'Rol',
      required: true,
      defaultValue: 'passenger',
      saveToJWT: true,
      options: [
        { label: 'Passagier', value: 'passenger' },
        { label: 'Chauffeur', value: 'driver' },
        { label: 'Medewerker', value: 'operator' },
        { label: 'Beheerder', value: 'admin' },
      ],
      access: {
        update: ({ req }) => req.user?.role === 'admin',
      },
      admin: { description: 'Alleen een beheerder wijzigt rollen.' },
    },
    {
      name: 'phone',
      type: 'text',
      label: 'Telefoonnummer',
      maxLength: 30,
      access: { update: ownUserOrOperatorField },
      validate: (value: string | null | undefined) =>
        !value || /^[0-9+().\-\s]{6,30}$/.test(value) || 'Vul een geldig telefoonnummer in.',
    },
    {
      name: 'preferredLanguage',
      type: 'select',
      label: 'Voorkeurstaal',
      defaultValue: 'nl',
      options: [
        { label: 'Nederlands', value: 'nl' },
        { label: 'Engels', value: 'en' },
      ],
      access: { update: ownUserOrOperatorField },
    },
    {
      name: 'internalNotes',
      type: 'textarea',
      label: 'Interne notities',
      maxLength: 1000,
      access: {
        read: ({ req }) => isOperator(req.user as HitchUser | null),
        update: ({ req }) => isOperator(req.user as HitchUser | null),
      },
    },
    {
      name: 'passengerRides',
      type: 'join',
      collection: 'rides',
      on: 'passenger',
      admin: { allowCreate: false, description: 'Ritten die deze gebruiker als passagier heeft gemaakt.' },
    },
    {
      name: 'driverRides',
      type: 'join',
      collection: 'rides',
      on: 'driver',
      admin: { allowCreate: false, description: 'Ritten die deze gebruiker als chauffeur uitvoert.' },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.name === 'string') data.name = normalizeName(data.name)
        if (typeof data.email === 'string') data.email = data.email.trim().toLowerCase()
        if (typeof data.phone === 'string') data.phone = data.phone.trim()
        return data
      },
    ],
    beforeChange: [
      ({ context, data, operation }) => {
        if (operation === 'create' && !context.allowPrivilegedRole) data.role = 'passenger'
        return data
      },
    ],
  },
  timestamps: true,
}
