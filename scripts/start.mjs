import 'dotenv/config'
import { access, cp } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const standalone = path.join(projectRoot, '.next', 'standalone')
const server = path.join(standalone, 'server.js')

try { await access(server) }
catch { throw new Error('De productiebuild ontbreekt. Voer eerst npm run build uit.') }

// Next.js leaves these assets out of the standalone bundle by default.
await cp(path.join(projectRoot, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true, force: true })
const publicDirectory = path.join(projectRoot, 'public')
try { await access(publicDirectory); await cp(publicDirectory, path.join(standalone, 'public'), { recursive: true, force: true }) }
catch (error) { if (error.code !== 'ENOENT') throw error }

// The standalone server changes cwd; keep SQLite pointing at the same database.
const databaseURL = process.env.DATABASE_URL || 'file:./hitchtracker.db'
if (databaseURL.startsWith('file:')) {
  const databasePath = databaseURL.slice(5)
  process.env.DATABASE_URL = databasePath === ':memory:' || path.isAbsolute(databasePath) || databasePath.startsWith('//')
    ? databaseURL
    : `file:${path.resolve(projectRoot, databasePath).replaceAll('\\', '/')}`
} else { process.env.DATABASE_URL = databaseURL }

await import(pathToFileURL(server).href)
