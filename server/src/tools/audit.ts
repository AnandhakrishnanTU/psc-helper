// Runs the extractor over every notification still listed on the PSC site and reports likely misreads.
// Run: npm run audit   (PDF text is cached in .cache/ so re-runs are fast)
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { extractDetails, parseTitle } from '../extract.js'
import { fetchPdfText } from '../http.js'
import { getGazetteLinks, getGazettes } from '../scraper.js'

const CACHE = '.cache/pdf-text'
fs.mkdirSync(CACHE, { recursive: true })

async function cachedPdfText(url: string) {
  const file = path.join(CACHE, `${createHash('sha1').update(url).digest('hex')}.txt`)
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  const text = await fetchPdfText(url)
  fs.writeFileSync(file, text)
  return text
}

const links: { url: string; text: string }[] = []
for (const gazette of await getGazettes()) {
  try {
    links.push(...await getGazetteLinks(gazette.url))
  } catch (err) {
    console.error(`Gazette failed: ${gazette.url}`, err)
  }
}
console.log(`Checking ${links.length} notifications...`)

const report: Record<string, unknown>[] = []
const problems: Record<string, number> = {}
const reasons: Record<string, number> = {}
let index = 0

async function worker() {
  while (index < links.length) {
    const link = links[index++]
    try {
      const heading = parseTitle(link.text)
      const text = await cachedPdfText(link.url)
      const d = extractDetails(text)
      const e = d.eligibility
      const issues = [
        !heading.categoryNo && 'no category number in title',
        !text.trim() && 'PDF has no text (scanned image?)',
        !d.qualification && 'qualification section not found',
        d.qualification.length > 1500 && 'qualification section very long',
        !e.qualifications.length && 'qualification level not detected',
        !d.ageLimit && 'age section not found',
        d.ageLimit && !e.dobFrom && !e.maxAge && !/not applicable/i.test(d.ageLimit) && 'age limit not parsed',
        !d.pay && 'pay not found',
      ].filter((x): x is string => typeof x === 'string' && x !== '')
      for (const i of issues) problems[i] = (problems[i] ?? 0) + 1
      for (const r of e.checkReasons ?? []) reasons[r] = (reasons[r] ?? 0) + 1
      report.push({ url: link.url, title: link.text.trim(), issues, needsCheck: e.needsCheck, eligibility: e,
        qualification: d.qualification.slice(0, 400), ageLimit: d.ageLimit.slice(0, 300) })
    } catch (err) {
      problems['download/parse failed'] = (problems['download/parse failed'] ?? 0) + 1
      report.push({ url: link.url, title: link.text.trim(), issues: [`failed: ${err}`] })
    }
    if (report.length % 50 === 0) console.log(`  ${report.length}/${links.length}`)
  }
}
await Promise.all(Array.from({ length: 4 }, worker))

fs.writeFileSync('.cache/audit.json', JSON.stringify(report, null, 2))
const needsCheck = report.filter(r => r.needsCheck).length
console.log(`\n${report.length} notifications checked`)
console.log(`Marked "check eligibility": ${needsCheck} (${Math.round((needsCheck / report.length) * 100)}%)`)
console.log('Problems:', problems)
console.log('"Check eligibility" reasons:', reasons)
console.log('Full report: .cache/audit.json')
