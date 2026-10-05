import { getOpenJobs, getSubscriptionById, getVerifiedSubscriptions, markSent, wasSent } from './db.js'
import { log } from './log.js'
import { checkEligibility, subjectMatches } from './matcher.js'
import { sendJobAlert } from './notifier.js'
import type { Job, Subscription } from './types.js'

function matchesFor(sub: Subscription, jobs: Job[]) {
  return jobs.filter(job => !wasSent(sub.id, job.id) && checkEligibility(sub.profile, job) !== 'no' && subjectMatches(sub.profile, job))
}

let running: Promise<void> = Promise.resolve()

/** Runs one task at a time, so two runs never send the same alert twice. */
function exclusive(task: () => Promise<void>): Promise<void> {
  running = running.then(task, task)
  return running
}

/** Sends each verified subscriber the approved open jobs they have not been told about yet. */
export function sendPendingAlerts(): Promise<void> {
  return exclusive(async () => {
    const jobs = getOpenJobs()
    if (!jobs.length) return
    let sentCount = 0
    for (const sub of getVerifiedSubscriptions()) {
      const matches = matchesFor(sub, jobs)
      if (!matches.length) continue
      try {
        const title = matches.length === 1
          ? `New PSC job you can apply for: ${matches[0].title}`
          : `${matches.length} new PSC jobs you can apply for`
        if (await sendJobAlert(sub, matches, title)) markSent(sub.id, matches.map(j => j.id))
        sentCount++
      } catch (err) {
        // Not marked as sent, so it is retried on the next run
        log.error(`Alert to subscription ${sub.id} failed`, err)
      }
    }
    if (sentCount) log.info(`Sent alerts to ${sentCount} subscribers`)
  })
}

/** First message after a subscription is confirmed, listing jobs already open. */
export function sendWelcome(subscriptionId: number): Promise<void> {
  return exclusive(async () => {
    const sub = getSubscriptionById(subscriptionId)
    if (!sub?.verified) return
    const matches = matchesFor(sub, getOpenJobs())
    const title = matches.length
      ? `PSC Helper alerts are on. ${matches.length} open job(s) match you now`
      : 'PSC Helper alerts are on. We will tell you when a matching job is published'
    try {
      if (await sendJobAlert(sub, matches, title)) markSent(sub.id, matches.map(j => j.id))
    } catch (err) {
      log.error(`Welcome message to subscription ${sub.id} failed`, err)
    }
  })
}

let timer: NodeJS.Timeout | undefined

/** Waits a little so approving several jobs in a row produces one combined alert. */
export function scheduleAlerts(delayMs = 2 * 60_000) {
  clearTimeout(timer)
  timer = setTimeout(() => void sendPendingAlerts(), delayMs)
}
