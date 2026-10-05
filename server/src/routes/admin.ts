import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { sendPendingAlerts } from '../alerts.js'
import { adminEnabled, config, deadline } from '../config.js'
import { exportAll, getJob, getJobUpdates, lastSuccessfulRun, listJobs, recentRuns, stats, updateJob } from '../db.js'
import { log } from '../log.js'
import { emailEnabled, vapidPublicKey } from '../notifier.js'
import { limiter } from '../rateLimit.js'
import { runJobCheck } from '../scheduler.js'
import { jobEditSchema } from '../validation.js'

export const adminRoutes = Router()

const hash = (s: string) => createHash('sha256').update(s).digest()

/** Constant-time comparison of a Bearer token with a secret. */
export function bearerMatches(req: Request, secret: string) {
  const given = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  return secret.length > 0 && timingSafeEqual(hash(given), hash(secret))
}

// Blocks password guessing: 10 wrong passwords per 15 minutes per IP
adminRoutes.use(limiter('admin-login', 15 * 60_000, 10, {
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401, // only wrong passwords count
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
}))

adminRoutes.use((req: Request, res: Response, next: NextFunction) => {
  if (!adminEnabled) {
    res.status(503).json({ error: 'Admin is disabled. Set ADMIN_PASSWORD (at least 12 characters) on the server.' })
    return
  }
  if (!bearerMatches(req, config.adminPassword)) {
    res.status(401).json({ error: 'Wrong password' })
    return
  }
  next()
})

adminRoutes.get('/summary', async (_req, res) => {
  res.json({
    stats: await stats(),
    runs: await recentRuns(),
    lastSuccessfulCheck: await lastSuccessfulRun(),
    setup: {
      email: emailEnabled,
      push: Boolean(vapidPublicKey),
      adminEmail: Boolean(config.adminEmail),
      appUrl: config.appUrl,
    },
  })
})

adminRoutes.get('/jobs', async (req, res) => {
  const filter = z.enum(['review', 'open', 'all']).catch('review').parse(req.query.filter)
  const records = await listJobs(filter)
  const updates = await getJobUpdates(records.map(r => r.job.id))
  res.json(records.map(r => ({ ...r, updates: updates.filter(u => u.jobId === r.job.id) })))
})

adminRoutes.put('/jobs/:id', async (req, res) => {
  const record = await getJob(req.params.id as string)
  if (!record) {
    res.status(404).json({ error: 'Job not found' })
    return
  }
  const edit = jobEditSchema.safeParse(req.body)
  if (!edit.success) {
    res.status(400).json({ error: 'Invalid job data', issues: z.flattenError(edit.error).fieldErrors })
    return
  }
  await updateJob({ ...record.job, ...edit.data })
  res.json(await getJob(record.job.id))
})

adminRoutes.post('/jobs/:id/status', async (req, res) => {
  const record = await getJob(req.params.id as string)
  const status = z.enum(['pending', 'approved', 'rejected', 'cancelled']).safeParse(req.body?.status)
  if (!record || !status.success) {
    res.status(400).json({ error: 'Unknown job or status' })
    return
  }
  // Approving or rejecting means the admin has dealt with any open flag
  await updateJob(record.job, { status: status.data, flag: status.data === 'pending' ? undefined : null })
  log.info(`Job ${record.job.id} set to ${status.data}`)
  res.json(await getJob(record.job.id))
})

adminRoutes.post('/jobs/:id/clear-flag', async (req, res) => {
  const record = await getJob(req.params.id as string)
  if (!record) {
    res.status(404).json({ error: 'Job not found' })
    return
  }
  await updateJob(record.job, { flag: null })
  res.json(await getJob(record.job.id))
})

adminRoutes.post('/check-now', async (_req, res) => {
  res.json(await runJobCheck())
})

adminRoutes.post('/send-alerts-now', async (_req, res) => {
  res.json(await sendPendingAlerts(deadline()))
})

adminRoutes.get('/backup', async (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="govjoli-backup-${new Date().toISOString().slice(0, 10)}.json"`)
  res.json(await exportAll())
})
