import cron from 'node-cron'
import { sendPendingAlerts } from './alerts.js'
import { dailyBackup } from './backup.js'
import { deleteStaleUnverified, finishRun, getJob, lastSuccessfulRun, startRun } from './db.js'
import { log } from './log.js'
import { sendAdminEmail } from './notifier.js'
import { scrape } from './scraper.js'

let checking = false

/** One full check: scrape PSC, tell the admin about anything needing attention, send alerts. */
export async function runJobCheck() {
  if (checking) return { skipped: true }
  checking = true
  const runId = startRun()
  try {
    const result = await scrape()
    finishRun(runId, result.newJobs.length, result.errors)

    const lines: string[] = []
    for (const id of result.newJobs) lines.push(`New job to review: ${getJob(id)?.job.title} (${id})`)
    for (const id of result.flagged) lines.push(`Needs a re-check: ${getJob(id)?.job.title} (${id}): ${getJob(id)?.flag}`)
    if (result.errors.length) {
      await sendAdminEmail(`Job check had ${result.errors.length} error(s)`, [...result.errors, ...lines])
    } else if (lines.length) {
      await sendAdminEmail(`${lines.length} job(s) waiting for review`, lines)
    }

    await sendPendingAlerts()
    return result
  } catch (err) {
    finishRun(runId, 0, [String(err)])
    log.error('Job check crashed', err)
    await sendAdminEmail('Job check crashed', [String(err)])
    throw err
  } finally {
    checking = false
  }
}

/** Warns the admin if no check has succeeded for a long time (site down or layout changed). */
async function checkStaleness() {
  const last = lastSuccessfulRun()
  const hours = last ? (Date.now() - Date.parse(last)) / 3_600_000 : Infinity
  if (hours > 12) {
    await sendAdminEmail('No successful job check in over 12 hours', [
      last ? `Last success: ${last}` : 'No successful check yet',
      'Check the server logs and the PSC website.',
    ])
  }
}

export function startScheduler() {
  const options = { timezone: 'Asia/Kolkata' }
  const safely = (name: string, task: () => unknown) => async () => {
    try {
      await task()
    } catch (err) {
      log.error(`${name} failed`, err)
    }
  }

  setTimeout(safely('Startup job check', runJobCheck), 10_000)
  cron.schedule('0 */3 * * *', safely('Job check', runJobCheck), options)
  cron.schedule('0 9 * * *', safely('Staleness check', checkStaleness), options)
  cron.schedule('30 2 * * *', safely('Daily maintenance', () => {
    dailyBackup()
    const removed = deleteStaleUnverified()
    if (removed) log.info(`Deleted ${removed} unconfirmed sign-ups`)
  }), options)
}
