import { createHash, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { scheduleAlerts, sendPendingAlerts } from '../alerts.js'
import { backupTo } from '../backup.js'
import { adminEnabled, config } from '../config.js'
import { getJob, getJobUpdates, lastSuccessfulRun, listJobs, recentRuns, stats, updateJob } from '../db.js'
import { log } from '../log.js'
import { emailEnabled, vapidPublicKey } from '../notifier.js'
import { runJobCheck } from '../scheduler.js'
import { jobEditSchema } from '../validation.js'

export const adminRoutes = Router()

const hash = (s: string) => createHash('sha256').update(s).digest()

// Blocks password guessing: 10 wrong attempts per 15 minutes per IP
adminRoutes.use(rateLimit({
  windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401, // only wrong passwords count
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
}))

adminRoutes.use((req: Request, res: Response, next: NextFunction) => {
  if (!adminEnabled) {
    res.status(503).json({ error: 'Admin is disabled. Set ADMIN_PASSWORD (at least 12 characters) on the server.' })
    return
  }
  const given = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!timingSafeEqual(hash(given), hash(config.adminPassword))) {
    res.status(401).json({ error: 'Wrong password' })
    return
  }
  next()
})

adminRoutes.get('/summary', (_req, res) => {
  res.json({
    stats: stats(),
    runs: recentRuns(),
    lastSuccessfulCheck: lastSuccessfulRun(),
    setup: {
      email: emailEnabled,
      push: Boolean(vapidPublicKey),
      adminEmail: Boolean(config.adminEmail),
      appUrl: config.appUrl,
    },
  })
})

adminRoutes.get('/jobs', (req, res) => {
  const filter = z.enum(['review', 'open', 'all']).catch('review').parse(req.query.filter)
  const records = listJobs(filter)
  const updates = getJobUpdates(records.map(r => r.job.id))
  res.json(records.map(r => ({ ...r, updates: updates.filter(u => u.jobId === r.job.id) })))
})

adminRoutes.put('/jobs/:id', (req, res) => {
  const record = getJob(req.params.id as string)
  if (!record) {
    res.status(404).json({ error: 'Job not found' })
    return
  }
  const edit = jobEditSchema.safeParse(req.body)
  if (!edit.success) {
    res.status(400).json({ error: 'Invalid job data', issues: z.flattenError(edit.error).fieldErrors })
    return
  }
  updateJob({ ...record.job, ...edit.data })
  res.json(getJob(record.job.id))
})

adminRoutes.post('/jobs/:id/status', (req, res) => {
  const record = getJob(req.params.id as string)
  const status = z.enum(['pending', 'approved', 'rejected', 'cancelled']).safeParse(req.body?.status)
  if (!record || !status.success) {
    res.status(400).json({ error: 'Unknown job or status' })
    return
  }
  // Approving or rejecting means the admin has dealt with any open flag
  const flag = status.data === 'pending' ? undefined : null
  updateJob(record.job, { status: status.data, flag })
  log.info(`Job ${record.job.id} set to ${status.data}`)
  if (status.data === 'approved') scheduleAlerts()
  res.json(getJob(record.job.id))
})

adminRoutes.post('/jobs/:id/clear-flag', (req, res) => {
  const record = getJob(req.params.id as string)
  if (!record) {
    res.status(404).json({ error: 'Job not found' })
    return
  }
  updateJob(record.job, { flag: null })
  res.json(getJob(record.job.id))
})

adminRoutes.post('/check-now', (_req, res) => {
  // A full check can take minutes, so answer immediately
  runJobCheck().catch(err => log.error('Manual job check failed', err))
  res.json({ ok: true })
})

adminRoutes.post('/send-alerts-now', async (_req, res) => {
  await sendPendingAlerts()
  res.json({ ok: true })
})

adminRoutes.get('/backup', (_req, res) => {
  const file = path.join(os.tmpdir(), `psc-helper-backup-${Date.now()}.db`)
  backupTo(file)
  res.download(file, `psc-helper-${new Date().toISOString().slice(0, 10)}.db`, () => fs.rmSync(file, { force: true }))
})
