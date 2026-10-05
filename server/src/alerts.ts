import { claimSent, getOpenJobs, getSentPairs, getSubscriptionById, getVerifiedSubscriptions, unclaimSent } from './db.js'
import { log } from './log.js'
import { checkEligibility, subjectMatches } from './matcher.js'
import { sendJobAlert } from './notifier.js'
import type { Job, Subscription } from './types.js'

const matches = (sub: Subscription, job: Job) => checkEligibility(sub.profile, job) !== 'no' && subjectMatches(sub.profile, job)

/** Reserves the jobs, sends one message, and releases the reservation if sending fails. */
async function deliver(sub: Subscription, jobs: Job[], title: (claimed: Job[]) => string, allowEmpty = false) {
  const claimedIds = await claimSent(sub.id, jobs.map(j => j.id))
  const claimed = jobs.filter(j => claimedIds.includes(j.id))
  if (!claimed.length && !allowEmpty) return false
  try {
    await sendJobAlert(sub, claimed, title(claimed))
    return true
  } catch (err) {
    await unclaimSent(sub.id, claimedIds)
    log.error(`Alert to subscription ${sub.id} failed, will retry next run`, err)
    return false
  }
}

/** Sends each verified subscriber the approved open jobs they have not been told about yet. */
export async function sendPendingAlerts(outOfTime: () => boolean = () => false): Promise<{ sent: number; unfinished: boolean }> {
  const jobs = await getOpenJobs()
  if (!jobs.length) return { sent: 0, unfinished: false }
  const alreadySent = await getSentPairs(jobs.map(j => j.id))

  let sent = 0
  for (const sub of await getVerifiedSubscriptions()) {
    const due = jobs.filter(job => !alreadySent.has(`${sub.id}:${job.id}`) && matches(sub, job))
    if (!due.length) continue
    if (outOfTime()) return { sent, unfinished: true }
    const ok = await deliver(sub, due, claimed => claimed.length === 1
      ? `New PSC job you can apply for: ${claimed[0].title}`
      : `${claimed.length} new PSC jobs you can apply for`)
    if (ok) sent++
  }
  if (sent) log.info(`Sent alerts to ${sent} subscribers`)
  return { sent, unfinished: false }
}

/** First message after a subscription is confirmed, listing jobs already open. */
export async function sendWelcome(subscriptionId: number) {
  const sub = await getSubscriptionById(subscriptionId)
  if (!sub?.verified) return
  const open = (await getOpenJobs()).filter(job => matches(sub, job))
  await deliver(sub, open, claimed => claimed.length
    ? `GovJoli alerts are on. ${claimed.length} open job(s) match you now`
    : 'GovJoli alerts are on. We will tell you when a matching job is published', true)
}
