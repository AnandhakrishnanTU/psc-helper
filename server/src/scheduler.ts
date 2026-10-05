// Scheduled work. On Vercel it is triggered over HTTP by Supabase pg_cron (every 3 hours) and
// Vercel cron (daily backup trigger); the local dev server runs it with node-cron.
import { sendPendingAlerts } from './alerts.js'
import { deadline } from './config.js'
import {
  acquireLock, deleteExpiredRateLimits, deleteOldRuns, deleteStaleUnverified, finishRun, getJob, lastSuccessfulRun,
  releaseLock, startRun,
} from './db.js'
import { log } from './log.js'
import { sendAdminEmail } from './notifier.js'
import { scrape } from './scraper.js'

/** One full check: scrape PSC, tell the admin about anything needing attention, send alerts. */
export async function runJobCheck() {
  if (!await acquireLock('job-check', 10)) return { skipped: 'Another check is already running' }
  const outOfTime = deadline()
  const runId = await startRun()
  try {
    const result = await scrape(outOfTime)
    await finishRun(runId, result.newJobs.length, result.errors)

    const lines: string[] = []
    for (const id of result.newJobs) lines.push(`New job to review: ${(await getJob(id))?.job.title} (${id})`)
    for (const id of result.flagged) {
      const r = await getJob(id)
      lines.push(`Needs a re-check: ${r?.job.title} (${id}): ${r?.flag}`)
    }
    if (result.unfinished) lines.push('Not all new notifications were read in this run; the rest will be read in the next one.')
    if (result.errors.length) {
      await sendAdminEmail(`Job check had ${result.errors.length} error(s)`, [...result.errors, ...lines])
    } else if (result.newJobs.length || result.flagged.length) {
      await sendAdminEmail(`${result.newJobs.length + result.flagged.length} job(s) waiting for review`, lines)
    }

    const alerts = await sendPendingAlerts(outOfTime)
    return { ...result, alertsSent: alerts.sent, alertsUnfinished: alerts.unfinished }
  } catch (err) {
    await finishRun(runId, 0, [String(err)])
    log.error('Job check crashed', err)
    await sendAdminEmail('Job check crashed', [String(err)])
    throw err
  } finally {
    await releaseLock('job-check')
  }
}

/** Daily: clean up, warn if checks stopped, and run a check if the 3-hourly schedule seems to have stopped. */
export async function runDailyMaintenance() {
  const removed = await deleteStaleUnverified()
  await deleteExpiredRateLimits()
  await deleteOldRuns()
  if (removed) log.info(`Deleted ${removed} unconfirmed sign-ups`)

  const last = await lastSuccessfulRun()
  const hours = last ? (Date.now() - Date.parse(last)) / 3_600_000 : Infinity
  if (hours > 6) {
    await sendAdminEmail('No successful job check in over 6 hours', [
      last ? `Last success: ${last}` : 'No successful check yet',
      'Running a check now. If this repeats, check the Supabase cron job and the Vercel logs.',
    ])
    return { removed, check: await runJobCheck() }
  }
  return { removed }
}
