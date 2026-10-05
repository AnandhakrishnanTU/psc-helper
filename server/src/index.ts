// Local server: the API plus (if built) the React app, and the schedule that pg_cron runs in production.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cron from 'node-cron'
import { app } from './app.js'
import { adminEnabled, config } from './config.js'
import { log } from './log.js'
import { runDailyMaintenance, runJobCheck } from './scheduler.js'
import { closeDb } from './sql.js'

const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  // Serve the built app too, so `npm start` can be tested like production
  const site = express.Router()
  site.use(express.static(clientDist))
  site.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))
  app.use(site)
}

const server = app.listen(config.port, config.host, () => {
  log.info(`Server running on http://${config.host}:${config.port}`)
  if (!adminEnabled) log.warn('ADMIN_PASSWORD not set (min 12 chars): admin page is disabled')
})

const safely = (name: string, task: () => Promise<unknown>) => () => {
  task().catch(err => log.error(`${name} failed`, err))
}
setTimeout(safely('Startup job check', runJobCheck), 10_000)
cron.schedule('15 */3 * * *', safely('Job check', runJobCheck), { timezone: 'Asia/Kolkata' })
cron.schedule('30 8 * * *', safely('Daily maintenance', runDailyMaintenance), { timezone: 'Asia/Kolkata' })

function shutdown(signal: string) {
  log.info(`${signal} received, shutting down`)
  server.close(() => void closeDb().finally(() => process.exit(0)))
  setTimeout(() => process.exit(0), 5_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
