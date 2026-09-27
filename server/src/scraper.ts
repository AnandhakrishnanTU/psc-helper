import * as cheerio from 'cheerio'
import { PDFParse } from 'pdf-parse'
import { jobExists } from './db.js'
import { extractDetails, parseTitle } from './extract.js'
import type { Job } from './types.js'

const BASE = 'https://www.keralapsc.gov.in'
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (PSC Helper)' }

async function fetchText(url: string) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.text()
}

async function fetchPdfText(url: string) {
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const parser = new PDFParse({ data: new Uint8Array(await res.arrayBuffer()) })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

/** Gazettes on the notifications page whose last date has not passed. */
async function getActiveGazettes() {
  const $ = cheerio.load(await fetchText(`${BASE}/notifications`))
  const today = new Date().toISOString().slice(0, 10)
  return $('table tbody tr').toArray()
    .map(row => ({
      url: new URL($(row).find('td a').first().attr('href') ?? '', BASE).href,
      lastDate: ($(row).find('time').attr('datetime') ?? '').slice(0, 10),
    }))
    .filter(g => g.lastDate >= today)
}

/** Fetches currently open jobs from keralapsc.gov.in, skipping ones already stored. */
export async function fetchPscJobs(): Promise<Job[]> {
  const jobs: Job[] = []

  for (const gazette of await getActiveGazettes()) {
    const $ = cheerio.load(await fetchText(gazette.url))
    const links = $('.field--name-field-notification a[href$=".pdf"]').toArray()

    for (const link of links) {
      const notificationUrl = new URL($(link).attr('href')!, BASE).href.replace(/^http:/, 'https:')
      const heading = parseTitle($(link).text())
      const id = heading.categoryNo || notificationUrl
      if (jobExists(id)) continue

      try {
        const details = extractDetails(await fetchPdfText(notificationUrl))
        jobs.push({
          id,
          categoryNo: heading.categoryNo,
          title: heading.title,
          department: heading.department,
          qualification: details.qualification,
          ageLimit: details.ageLimit,
          pay: details.pay,
          vacancies: details.vacancies,
          lastDate: gazette.lastDate,
          notificationUrl,
          eligibility: {
            ...details.eligibility,
            communities: heading.communities,
            inServiceOnly: heading.inServiceOnly || details.eligibility.inServiceOnly || undefined,
          },
        })
      } catch (err) {
        console.error(`Skipping ${notificationUrl}:`, err)
      }
    }
  }
  return jobs
}
