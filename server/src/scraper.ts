import * as cheerio from 'cheerio'
import {
  addJobUpdate, flagJob, getJob, getJobsByGazette, insertJob, isUpdateSeen, listJobs, markUpdateSeen, updateJob,
} from './db.js'
import { formatDate, todayIST } from './dates.js'
import { categoryKeys, extractDetails, parseTitle } from './extract.js'
import { fetchPdfText, fetchText } from './http.js'
import { log } from './log.js'
import type { Job, JobUpdateKind } from './types.js'

const BASE = 'https://www.keralapsc.gov.in'

export interface ScrapeResult {
  newJobs: string[]
  flagged: string[]
  errors: string[]
  unfinished: boolean // ran out of time; the rest is picked up by the next run
}

const absolute = (href: string) => new URL(href, BASE).href.replace(/^http:/, 'https:')

/** Every gazette row on the notifications page. */
export async function getGazettes() {
  const $ = cheerio.load(await fetchText(`${BASE}/notifications`))
  return $('table tbody tr').toArray()
    .map(row => ({
      url: absolute($(row).find('td a').first().attr('href') ?? ''),
      lastDate: ($(row).find('time').attr('datetime') ?? '').slice(0, 10),
    }))
    .filter(g => g.url && /^\d{4}-\d{2}-\d{2}$/.test(g.lastDate))
}

/** Notification PDF links on one gazette page. */
export async function getGazetteLinks(gazetteUrl: string) {
  const $ = cheerio.load(await fetchText(gazetteUrl))
  return $('.field--name-field-notification a[href$=".pdf"]').toArray()
    .map(link => ({ url: absolute($(link).attr('href')!), text: $(link).text() }))
}

export async function buildJob(link: { url: string; text: string }, gazette: { url: string; lastDate: string }): Promise<Job> {
  const heading = parseTitle(link.text)
  const details = extractDetails(await fetchPdfText(link.url))
  return {
    // The id must come from the listing alone, so a job can be recognised before downloading its PDF
    id: heading.categoryNo || link.url,
    categoryNo: heading.categoryNo || details.categoryNo,
    title: heading.title,
    department: heading.department,
    qualification: details.qualification,
    ageLimit: details.ageLimit,
    pay: details.pay,
    vacancies: details.vacancies,
    lastDate: gazette.lastDate,
    notificationUrl: link.url,
    gazetteUrl: gazette.url,
    eligibility: {
      ...details.eligibility,
      communities: heading.communities,
      inServiceOnly: heading.inServiceOnly || details.eligibility.inServiceOnly || undefined,
    },
  }
}

async function scrapeGazette(gazette: { url: string; lastDate: string }, result: ScrapeResult, outOfTime: () => boolean) {
  const links = await getGazetteLinks(gazette.url)
  if (!links.length) {
    result.errors.push(`No notification PDFs found on ${gazette.url} (page layout may have changed)`)
    return
  }
  const listed = new Set(links.map(link => parseTitle(link.text).categoryNo || link.url))

  for (const link of links) {
    const id = parseTitle(link.text).categoryNo || link.url
    const existing = await getJob(id)

    if (!existing) {
      if (outOfTime()) {
        result.unfinished = true
        continue
      }
      try {
        if (await insertJob(await buildJob(link, gazette))) result.newJobs.push(id)
      } catch (err) {
        result.errors.push(`Could not read ${link.url}: ${err instanceof Error ? err.message : err}`)
      }
      continue
    }

    const job = existing.job
    if (job.lastDate !== gazette.lastDate) {
      await addJobUpdate(id, 'extension', `Last date changed from ${formatDate(job.lastDate)} to ${formatDate(gazette.lastDate)}`)
      await updateJob({ ...job, lastDate: gazette.lastDate })
    }
    if (job.notificationUrl !== link.url) {
      // Keep the admin-reviewed eligibility, but ask for a re-check
      await addJobUpdate(id, 'revised', 'PSC replaced the notification PDF', link.url)
      await updateJob({ ...job, lastDate: gazette.lastDate, notificationUrl: link.url })
      await flagJob(id, 'Notification PDF was replaced, re-check eligibility')
      result.flagged.push(id)
    }
  }

  for (const { job } of await getJobsByGazette(gazette.url)) {
    if (!listed.has(job.id) && await addJobUpdate(job.id, 'removed', 'No longer listed on the PSC notification page')) {
      await flagJob(job.id, 'Removed from PSC notification page, may be withdrawn')
      result.flagged.push(job.id)
    }
  }
}

/** Individual category numbers of a job's own "139-142/2026" style number. */
function jobKeys(categoryNo: string): string[] {
  return categoryNo ? categoryKeys(`Cat.No.${categoryNo}`) : []
}

function updateKind(text: string): JobUpdateKind {
  if (/cancel/i.test(text)) return 'cancellation'
  if (/erratum|corrigendum/i.test(text)) return 'erratum'
  return 'addendum'
}

async function scrapeAddendumPage(result: ScrapeResult) {
  const $ = cheerio.load(await fetchText(`${BASE}/addendum-erratum`))
  const rows = $('table tbody tr').toArray()
  if (!rows.length) {
    result.errors.push('No rows found on the Addendum/Erratum page (page layout may have changed)')
    return
  }

  const byKey = new Map<string, string>()
  for (const { job, status } of await listJobs('all')) {
    if (status !== 'rejected') for (const key of jobKeys(job.categoryNo)) byKey.set(key, job.id)
  }

  for (const row of rows) {
    const href = $(row).find('a').last().attr('href')
    if (!href) continue
    const url = absolute(href)
    if (await isUpdateSeen(url)) continue

    const title = $(row).find('td.views-field-title').text().replace(/\s+/g, ' ').trim()
    const body = $(row).find('td.views-field-body').text().replace(/\s+/g, ' ').trim()
    const jobIds = new Set(categoryKeys(`${title} ${body}`).map(k => byKey.get(k)).filter((id): id is string => !!id))

    for (const id of jobIds) {
      const kind = updateKind(`${title} ${body}`)
      await addJobUpdate(id, kind, title.slice(0, 300), url)
      const record = (await getJob(id))!
      if (record.status === 'pending' || record.job.lastDate >= todayIST()) {
        await flagJob(id, `PSC published ${kind === 'erratum' || kind === 'addendum' ? 'an' : 'a'} ${kind}`)
        result.flagged.push(id)
      }
    }
    await markUpdateSeen(url)
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Checks keralapsc.gov.in for new jobs and changes to known ones. Never throws. */
export async function scrape(outOfTime: () => boolean = () => false): Promise<ScrapeResult> {
  const result: ScrapeResult = { newJobs: [], flagged: [], errors: [], unfinished: false }

  try {
    const gazettes = await getGazettes()
    if (!gazettes.length) result.errors.push('No gazettes found on the notifications page (page layout may have changed)')
    for (const gazette of gazettes.filter(g => g.lastDate >= todayIST())) {
      try {
        await scrapeGazette(gazette, result, outOfTime)
      } catch (err) {
        result.errors.push(`Gazette ${gazette.url} failed: ${message(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(`Notifications page failed: ${message(err)}`)
  }

  try {
    await scrapeAddendumPage(result)
  } catch (err) {
    result.errors.push(`Addendum/Erratum page failed: ${message(err)}`)
  }

  result.flagged = [...new Set(result.flagged)]
  log.info('Scrape finished', { newJobs: result.newJobs.length, flagged: result.flagged.length, errors: result.errors.length, unfinished: result.unfinished })
  return result
}
