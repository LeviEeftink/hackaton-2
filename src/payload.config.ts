import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { AuditLogs } from './collections/AuditLogs'
import { Destinations } from './collections/Destinations'
import { Rides, RideEvents } from './collections/Rides'
import { RoutePoints, Routes } from './collections/Routes'
import { Tariffs } from './collections/Tariffs'
import { Users } from './collections/Users'
import { Vehicles } from './collections/Vehicles'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const secret = process.env.PAYLOAD_SECRET
if (!secret || secret.length < 32) {
  throw new Error('PAYLOAD_SECRET moet minimaal 32 tekens bevatten.')
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
  },
  editor: lexicalEditor(),
  db: sqliteAdapter({
    client: { url: process.env.DATABASE_URL || 'file:./hitchtracker.db' },
    transactionOptions: {},
    busyTimeout: 5000,
    wal: true,
  }),
  collections: [Users, Tariffs, Routes, RoutePoints, Vehicles, Destinations, Rides, RideEvents, AuditLogs],
  cors: [process.env.NEXT_PUBLIC_SERVER_URL].filter((url): url is string => Boolean(url)),
  secret,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
