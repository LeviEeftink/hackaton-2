import type { CollectionConfig } from 'payload'

import { operatorsOnly } from '@/access/roles'

export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'Auditregel', plural: 'Auditlog' },
  admin: {
    useAsTitle: 'action',
    defaultColumns: ['action', 'ride', 'actor', 'createdAt'],
    group: 'Operations',
  },
  defaultSort: '-createdAt',
  access: {
    create: () => false,
    read: operatorsOnly,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'action', type: 'select', required: true, options: ['ride_started', 'ride_progressed', 'ride_completed', 'ride_cancelled'] },
    { name: 'ride', type: 'relationship', relationTo: 'rides', required: true, index: true },
    { name: 'actor', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'metadata', type: 'json', label: 'Technische context' },
  ],
  timestamps: true,
}
