import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { fileURLToPath } from 'node:url'

const db = await PGlite.create(fileURLToPath(new URL('../data/postgres', import.meta.url)))
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: Number(process.env.PGPORT ?? 54329) })
await server.start()
console.log('PostgreSQL local (PGlite): 127.0.0.1:' + (process.env.PGPORT ?? 54329))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await server.stop()
  await db.close()
  process.exit(0)
})
