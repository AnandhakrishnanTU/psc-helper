import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import { adminEnabled, config, isProduction } from './config.js'
import { db } from './db.js'
import { log } from './log.js'
import { adminRoutes } from './routes/admin.js'
import { publicRoutes } from './routes/public.js'
import { startScheduler } from './scheduler.js'

const app = express()
app.set('trust proxy', config.trustProxy) // real client IP behind the host's proxy, for rate limits
app.disable('x-powered-by')
app.use(helmet())
app.use(express.json({ limit: '20kb' }))

// Overall limit per IP, on top of the per-route limits
app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }))
app.use('/api/admin', adminRoutes)
app.use('/api', publicRoutes)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// In production the same server also serves the built React app
const clientDist = config.clientDist ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist, {
    setHeaders(res, file) {
      // Hashed assets never change; index.html and the service worker must always be fresh
      const name = path.basename(file)
      res.setHeader('Cache-Control', file.includes(`${path.sep}assets${path.sep}`)
        ? 'public, max-age=31536000, immutable'
        : name === 'index.html' || name.startsWith('sw') || name.startsWith('workbox') ? 'no-cache' : 'public, max-age=86400')
    },
  }))
  app.get('/{*path}', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(clientDist, 'index.html'))
  })
} else if (isProduction) {
  log.warn(`Client build not found at ${clientDist}; only the API is served`)
}

app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    res.status(400).json({ error: 'Invalid request' })
    return
  }
  log.error('Unhandled request error', err)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
})

const server = app.listen(config.port, config.host, () => {
  log.info(`Server running on http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`)
  if (!adminEnabled) log.warn('ADMIN_PASSWORD not set (min 12 chars): admin page is disabled, so no jobs can be approved')
})
startScheduler()

function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`)
  server.close(() => {
    db.close()
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
