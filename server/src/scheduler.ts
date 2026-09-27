import cron from 'node-cron'
import { getSubscriptions, saveNewJobs } from './db.js'
import { checkEligibility } from './matcher.js'
import { notify } from './notifier.js'
import { fetchPscJobs } from './scraper.js'

export async function checkForNewJobs() {
  const newJobs = saveNewJobs(await fetchPscJobs())
  console.log(`Job check done: ${newJobs.length} new jobs`)
  if (!newJobs.length) return

  for (const sub of getSubscriptions()) {
    const matches = newJobs.filter(job => checkEligibility(sub.profile, job) !== 'no')
    if (matches.length) await notify(sub, matches)
  }
}

function runCheck() {
  checkForNewJobs().catch(err => console.error('Job check failed:', err))
}

export function startScheduler() {
  runCheck()
  cron.schedule('0 */3 * * *', runCheck) // every 3 hours
}
