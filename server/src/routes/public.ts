import { randomBytes } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { sendWelcome } from '../alerts.js'
import {
  deleteSubscription, getJobUpdates, getOpenJobs, getSubscriptionByEndpoint, getSubscriptionByToken,
  getSubscriptionsByEmail, insertSubscription, lastSuccessfulRun, updateSubscriptionProfile, updateSubscriptionPush,
  verifySubscription,
} from '../db.js'
import { log } from '../log.js'
import { checkEligibility, subjectMatches } from '../matcher.js'
import { emailEnabled, sendManageLinks, sendVerificationEmail, vapidPublicKey } from '../notifier.js'
import {
  alertProfileSchema, emailOnlySchema, profileSchema, pushRenewSchema, subscribeSchema, tokenSchema,
} from '../validation.js'

const MAX_ALERTS_PER_EMAIL = 3

export const publicRoutes = Router()

const limit = (perHour: number) => rateLimit({
  windowMs: 60 * 60_000, limit: perHour, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
})

const newToken = () => randomBytes(24).toString('hex')

function parse<T>(schema: z.ZodType<T>, data: unknown, res: Response): T | undefined {
  const result = schema.safeParse(data)
  if (!result.success) {
    const field = String(result.error.issues[0]?.path.at(-1) ?? '')
    const message: Record<string, string> = {
      dateOfBirth: result.error.issues[0]?.message.startsWith('Alerts') ? result.error.issues[0].message : 'Please enter a valid date of birth.',
      contact: 'Please enter a valid email address.',
      email: 'Please enter a valid email address.',
      consent: 'Please accept the privacy policy to turn on alerts.',
      qualification: 'Please choose your qualification.',
      endpoint: 'This browser\'s notification service is not supported. Try Chrome, Firefox, Edge or Safari.',
    }
    res.status(400).json({ error: message[field] ?? 'Please check the details you entered.', issues: z.flattenError(result.error).fieldErrors })
    return undefined
  }
  return result.data
}

/** Looks up the subscription for a manage/unsubscribe token, or sends 404. */
function findByToken(req: Request, res: Response) {
  const token = tokenSchema.safeParse(req.params.token ?? req.query.token ?? req.body?.token)
  const sub = token.success ? getSubscriptionByToken(token.data) : undefined
  if (!sub) res.status(404).json({ error: 'This link is not valid any more. The alert may already be deleted.' })
  return sub
}

publicRoutes.get('/health', (_req, res) => {
  res.json({ ok: true, lastSuccessfulCheck: lastSuccessfulRun() })
})

publicRoutes.get('/config', (_req, res) => {
  res.json({ pushPublicKey: vapidPublicKey, emailEnabled })
})

publicRoutes.post('/jobs/match', limit(300), (req, res) => {
  const profile = parse(profileSchema, req.body, res)
  if (!profile) return
  // Order: clearly eligible, then "check" jobs mentioning the user's subject, then other "check" jobs
  const rank = (m: { match: string; subject: boolean }) => (m.match === 'yes' ? 0 : m.subject ? 1 : 2)
  const matches = getOpenJobs()
    .map(job => ({ job, match: checkEligibility(profile, job), subject: subjectMatches(profile, job) }))
    .filter(({ match }) => match !== 'no')
    .sort((a, b) => rank(a) - rank(b) || a.job.lastDate.localeCompare(b.job.lastDate))
  const updates = getJobUpdates(matches.map(m => m.job.id))
  res.json(matches.map(({ job: { eligibility, gazetteUrl, ...job }, match, subject }) => ({
    ...job,
    needsCheck: match === 'maybe',
    subjectMismatch: !subject,
    checkReasons: eligibility.needsCheck ? (eligibility.checkReasons ?? []) : [],
    notes: eligibility.notes ?? [],
    updates: updates.filter(u => u.jobId === job.id).map(({ kind, title, url, createdAt }) => ({ kind, title, url, createdAt })),
  })))
})

publicRoutes.post('/subscriptions', limit(10), async (req, res) => {
  const input = parse(subscribeSchema, req.body, res)
  if (!input) return

  if (input.channel === 'email') {
    if (!emailEnabled) {
      res.status(503).json({ error: 'Email alerts are not available yet. Please use mobile notifications.' })
      return
    }
    if (getSubscriptionsByEmail(input.contact).length >= MAX_ALERTS_PER_EMAIL) {
      res.status(409).json({ error: `This email already has ${MAX_ALERTS_PER_EMAIL} alerts. Use "Manage my alerts" to change them.` })
      return
    }
    const sub = insertSubscription({
      token: newToken(), channel: 'email', contact: input.contact, profile: input.profile,
      verified: false, verifyToken: newToken(),
    })
    try {
      await sendVerificationEmail(sub)
    } catch (err) {
      log.error('Verification email failed', err)
      deleteSubscription(sub.id)
      res.status(502).json({ error: 'Could not send the confirmation email. Please try again later.' })
      return
    }
    res.json({ ok: true, needsVerification: true })
    return
  }

  // Push: the browser permission prompt already proves the user wants it
  const existing = getSubscriptionByEndpoint(input.push.endpoint)
  if (existing) {
    updateSubscriptionProfile(existing.id, input.profile)
    res.json({ ok: true, token: existing.token })
  } else {
    const sub = insertSubscription({
      token: newToken(), channel: 'push', push: input.push, profile: input.profile, verified: true, verifyToken: null,
    })
    res.json({ ok: true, token: sub.token })
    void sendWelcome(sub.id)
  }
})

publicRoutes.post('/subscriptions/verify', limit(30), (req, res) => {
  const token = parse(z.object({ token: tokenSchema }), req.body, res)
  if (!token) return
  const sub = verifySubscription(token.token)
  if (!sub) {
    res.status(404).json({ error: 'This confirmation link is not valid or was already used.' })
    return
  }
  res.json({ ok: true, token: sub.token })
  void sendWelcome(sub.id)
})

publicRoutes.post('/subscriptions/send-links', limit(5), async (req, res) => {
  const input = parse(emailOnlySchema, req.body, res)
  if (!input) return
  const subs = getSubscriptionsByEmail(input.email).filter(s => s.verified)
  if (subs.length) {
    try {
      await sendManageLinks(input.email, subs)
    } catch (err) {
      log.error('Manage link email failed', err)
    }
  }
  // Same answer either way, so nobody can find out which emails are registered
  res.json({ ok: true })
})

publicRoutes.post('/subscriptions/push-renew', limit(30), (req, res) => {
  const input = parse(pushRenewSchema, req.body, res)
  if (!input) return
  const sub = getSubscriptionByEndpoint(input.oldEndpoint)
  if (sub) updateSubscriptionPush(sub.id, input.push)
  res.json({ ok: true })
})

// One-click unsubscribe from email clients, and the unsubscribe page
publicRoutes.post('/subscriptions/unsubscribe', limit(30), (req, res) => {
  const sub = findByToken(req, res)
  if (!sub) return
  deleteSubscription(sub.id)
  res.json({ ok: true })
})

publicRoutes.get('/subscriptions/:token', limit(60), (req, res) => {
  const sub = findByToken(req, res)
  if (!sub) return
  res.json({ channel: sub.channel, contact: sub.contact, profile: sub.profile, verified: sub.verified })
})

publicRoutes.put('/subscriptions/:token', limit(30), (req, res) => {
  const sub = findByToken(req, res)
  if (!sub) return
  const profile = parse(alertProfileSchema, req.body?.profile, res)
  if (!profile) return
  updateSubscriptionProfile(sub.id, profile)
  res.json({ ok: true })
})

publicRoutes.delete('/subscriptions/:token', limit(30), (req, res) => {
  const sub = findByToken(req, res)
  if (!sub) return
  deleteSubscription(sub.id)
  res.json({ ok: true })
})
