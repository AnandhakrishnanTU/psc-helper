import express from 'express'
import { addSubscription, getActiveJobs } from './db.js'
import { checkEligibility } from './matcher.js'
import { notify, vapidPublicKey } from './notifier.js'
import { startScheduler } from './scheduler.js'
import type { Subscription, UserProfile } from './types.js'

const app = express()
app.use(express.json())

function matchingJobs(profile: UserProfile) {
  return getActiveJobs()
    .map(job => ({ job, match: checkEligibility(profile, job) }))
    .filter(({ match }) => match !== 'no')
}

app.post('/api/jobs/match', (req, res) => {
  const jobs = matchingJobs(req.body as UserProfile)
    .map(({ job: { eligibility, ...job }, match }) => ({ ...job, needsCheck: match === 'maybe' }))
  res.json(jobs)
})

app.get('/api/push/public-key', (_req, res) => {
  res.json({ key: vapidPublicKey })
})

app.post('/api/subscriptions', async (req, res) => {
  // TODO: validate input and verify email/phone before saving
  const sub = req.body as Subscription
  addSubscription(sub)
  res.json({ ok: true })

  // Confirmation message, listing jobs that are already open
  const current = matchingJobs(sub.profile).map(({ job }) => job)
  await notify(sub, current, `PSC Helper alerts enabled. ${current.length} open job(s) match you now`)
})

const PORT = Number(process.env.PORT ?? 4000)
app.listen(PORT, '127.0.0.1', () => console.log(`Server running on http://localhost:${PORT}`))
startScheduler()
