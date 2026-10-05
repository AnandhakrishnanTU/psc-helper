import { Router, type NextFunction, type Request, type Response } from 'express'
import { config } from '../config.js'
import { runDailyMaintenance, runJobCheck } from '../scheduler.js'
import { bearerMatches } from './admin.js'

// Called by Supabase pg_cron (job check, every 3 hours) and Vercel cron (daily, GET)
export const cronRoutes = Router()

cronRoutes.use((req: Request, res: Response, next: NextFunction) => {
  if (!bearerMatches(req, config.cronSecret)) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  next()
})

cronRoutes.all('/check', async (_req, res) => {
  res.json(await runJobCheck())
})

cronRoutes.all('/daily', async (_req, res) => {
  res.json(await runDailyMaintenance())
})
