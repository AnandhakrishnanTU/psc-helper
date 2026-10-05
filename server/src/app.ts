// The API as an Express app. Vercel runs it as a serverless function (api/index.js);
// index.ts runs it as a normal server for local development.
import express, { type NextFunction, type Request, type Response } from 'express'
import helmet from 'helmet'
import { config } from './config.js'
import { log } from './log.js'
import { adminRoutes } from './routes/admin.js'
import { cronRoutes } from './routes/cron.js'
import { publicRoutes } from './routes/public.js'

export const app = express()
app.set('trust proxy', config.trustProxy) // real client IP behind Vercel's proxy, for rate limits
app.disable('x-powered-by')
app.use(helmet())
app.use(express.json({ limit: '20kb' }))
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

app.use('/api/admin', adminRoutes)
app.use('/api/cron', cronRoutes)
app.use('/api', publicRoutes)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

export function errorHandler(err: Error & { type?: string }, _req: Request, res: Response, _next: NextFunction) {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
    res.status(400).json({ error: 'Invalid request' })
    return
  }
  log.error('Unhandled request error', err)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
}
app.use(errorHandler)

export default app
