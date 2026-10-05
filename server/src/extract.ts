// Rule-based extraction of eligibility from PSC notification text
import type { Eligibility, Qualification } from './types.js'

const BRANCHES = [
  'Civil', 'Mechanical', 'Electrical', 'Electronics', 'Computer', 'Information Technology',
  'Chemical', 'Agricultural', 'Automobile', 'Instrumentation', 'Architecture',
  'Electrician', 'Plumber', 'Fitter', 'Welder', 'Draughtsman', 'Turner', 'Wireman',
]

const COMMUNITY_CODES: Record<string, string> = {
  'E/B/T': 'Ezhava', 'EBT': 'Ezhava', 'Ezhava': 'Ezhava',
  'LC/AI': 'LC/AI', 'Muslim': 'Muslim', 'M': 'Muslim',
  'V': 'Viswakarma', 'Viswakarma': 'Viswakarma',
  'SIUCN': 'SIUC Nadar', 'SIUC Nadar': 'SIUC Nadar',
  'HN': 'Hindu Nadar', 'Hindu Nadar': 'Hindu Nadar',
  'D': 'Dheevara', 'Dheevara': 'Dheevara',
  'OX': 'OX', 'SCCC': 'SCCC', 'OBC': 'OBC', 'SC': 'SC', 'ST': 'ST',
}

// "Cat.No.144/2026", "Category No. 139-142/2026", "Cat. No: 127&128/2026", and typos like "Ca.No." / "at.No." / "Cat.90/2025"
const CAT_RE = /\(?\s*(?:\bCat(?:egory)?\.?\s*(?:Nos?\.?)?|\b(?:Ca|at)\.?\s*Nos?\.?)\s*[:.]?\s*(\d[\d\s,&–-]*?)\s*\/\s*(\d{4})\s*\)?/i
// Bare "(263/2025)" at the end of a title
const BARE_CAT_RE = /\(\s*(\d[\d,&–-]*)\s*\/\s*(\d{4})\s*\)\s*$/

/** All individual category numbers mentioned in a text, as "17/2025" (no leading zeros). */
export function categoryKeys(text: string): string[] {
  const keys: string[] = []
  for (const m of text.matchAll(new RegExp(CAT_RE.source, 'gi'))) {
    for (const part of m[1].split(/[&,]/)) {
      const [from, to = from] = part.split(/[-–]/).map(s => Number(s.trim()))
      if (!Number.isInteger(from) || !Number.isInteger(to)) continue
      for (let n = from; n <= to && n - from < 100; n++) keys.push(`${n}/${m[2]}`)
    }
  }
  return keys
}

function toIso(d: string, m: string, y: string) {
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Text after a numbered heading, up to the next note or numbered section. */
function section(text: string, heading: RegExp): string {
  const start = text.search(heading)
  if (start < 0) return ''
  const rest = text.slice(start).replace(heading, '').replace(/^[\s:\-–]+/, '')
  // Skip the first few characters: some notices put a "Note:" label right after the heading
  const MIN = 20
  const end = rest.slice(MIN).search(/\b(Note\s*[:(\-]|LINK\b|EQUIVALENT\s*\/\s*HIGHER|\d{1,2}\s*\.?\s+[A-Z][a-z]+(\s+of\s+\w+)?\s*[:\-–])/)
  return rest.slice(0, end >= 0 ? end + MIN : 1200).trim()
}

// Matched on text without dots ("S.S.L.C" -> "SSLC"). The optional second pattern is case-sensitive,
// for abbreviations that are also English words ("BE", "ME").
const LEVELS: [Qualification, RegExp, RegExp?][] = [
  ['Post Graduation', /master'?s? degree|post ?graduat|\bPG\b|\b(MA|MSc|MCom|MTech|MPhil|MBA|MCA|MD|MS|MCh|DNB|DrNB|DM|MDS|MPharm|MSW|MEd|LLM|MLISc|PhD)\b/i,
    /\bME\b/],
  ['B.Tech', /\bB ?Tech\b|degree in [\w ()&/,]{0,40}engineering|engineering degree|\bAMIE\b|institution of engineers|\bBArch\b/i, /\bBE\b/],
  ['Degree', /(?<!pre[-\s]?)\bdegree\b|graduat|bachelor|\b(BA|BSc|BCom|BBA|BCA|BEd|LLB|MBBS|BDS|BAMS|BHMS|BUMS|BSMS|BPharm|BVSc|BFA|BLISc|BSW)\b/i],
  ['Diploma', /diploma|polytechnic|\b(DPharm|GNM|DMLT|TTC|DElEd)\b/i],
  ['ITI', /\bITI\b|\bNTC\b|\bNAC\b|trade certificate|national trade|apprenticeship|industrial training institute/i],
  ['Plus Two', /plus\s*(two|2)\b|higher secondary|\bHSE\b|pre-?degree|\bPDC\b|\bVHSE\b|\b12th\b|\+ ?2\b/i],
  ['SSLC', /\bSSLC\b|matriculation|\b10th\b|tenth|secondary school leaving|\bSSC\b/i],
  ['Below SSLC', /\b(standard|std)\s*(IV|V|VI|VII|VIII|IX|[4-9])\b|\b(IV|V|VI|VII|VIII|IX|[4-9](th)?)\s*(standard|std)\b|literacy|read and write|literate/i],
]

/** Highest education level named in one qualification option. */
function classify(option: string): Qualification | null {
  const text = option.replace(/\./g, '')
  for (const [level, words, abbreviations] of LEVELS) {
    if (words.test(text) || abbreviations?.test(text)) return level
  }
  return null
}

// Only existing employees can apply. "From among candidates belonging to X community" is NOT this.
const IN_SERVICE = /in[- ]?service|by transfer|from among (the )?(qualified )?(employees|staff|personnel|members|PT |part[- ]time)/i

// "must not have passed Degree" style clauses
const NOT_ALLOWED = /(must|should) not (have )?(passed|acquired|possess)[^.;]*/gi

/** Parses "Name (I NCA-Muslim) - Department (Cat.No.144/2026)" style titles. */
export function parseTitle(raw: string) {
  const text = raw.replace(/\s+/g, ' ').trim()
  const cat = text.match(CAT_RE) ?? text.match(BARE_CAT_RE)
  const categoryNo = cat ? `${cat[1].replace(/\s+/g, '')}/${cat[2]}` : ''
  const withoutCat = (cat ? text.replace(cat[0], ' ') : text).replace(/\s+/g, ' ').replace(/[\s-]+$/, '').trim()
  const sep = withoutCat.lastIndexOf(' - ')
  const title = sep > 0 ? withoutCat.slice(0, sep).trim() : withoutCat
  const department = sep > 0 ? withoutCat.slice(sep + 3).trim() : ''

  let communities: string[] | undefined
  const nca = title.match(/NCA\s*-\s*([^)]+)\)/i)
  const sr = title.match(/SR for ([^)]+)\)/i)
  const list = nca?.[1] ?? sr?.[1]
  if (list) {
    let rest = list.replace(/\s*&\s*/g, '/')
    const found = new Set<string>()
    // Match multi-part codes first so "LC/AI" is not split on "/"
    for (const code of Object.keys(COMMUNITY_CODES).sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|/)\\s*${code.replace('/', '\\/')}\\s*(only)?\\s*(?=/|$)`, 'i')
      if (re.test(rest)) {
        found.add(COMMUNITY_CODES[code])
        rest = rest.replace(re, '$1')
      }
    }
    if (found.size) communities = [...found]
  }

  return {
    title,
    department,
    categoryNo,
    communities,
    inServiceOnly: IN_SERVICE.test(title) || /society category/i.test(title),
  }
}

export function extractDetails(pdfText: string) {
  // Join lines and drop the "-- 1 of 6 --" page markers added by the PDF reader
  const text = pdfText.replace(/--\s*\d+\s*of\s*\d+\s*--/g, ' ').replace(/\s+/g, ' ')

  const qualification = section(text, /\b\d{1,2}\s*[.)]?\s*(Educational\s+)?Qualifications?\b(?!\s+(of|prescribed|recogni[sz]ed|specified))/i)
  // "6. Age Limit :", "6. Age limt : 25–40", "6. Age limit 20-35", "6. Age . : 18-50"
  let ageLimit = section(text, /\b\d{1,2}\s*[.)]?\s*Age\s*\.?\s*(lim\w*)?\s*[.:\-–]*\s*(?=(Age\s*)?\d|\(|\[|Upper|Only|Not?\b|Candidates|Must|is\b|Minimum|Maximum)/i)
  if (!ageLimit) {
    // No numbered heading: use the text around the first "born between"
    const at = text.search(/born between/i)
    if (at >= 0) ageLimit = text.slice(Math.max(0, at - 60), at + 200).trim()
  }
  const pay = text.match(/Scale of pay\s*[:\-–]?\s*(.+?)\s+\d{1,2}\s*\.?\s+[A-Z]/i)?.[1]?.slice(0, 80) ?? ''
  let vacancies = text.match(/Number of vacancies\s*[:\-–]?\s*(.+?)\s+(The |\d{1,2}\s*\.\s)/i)?.[1] ?? ''
  if (vacancies.length > 40) vacancies = 'See notification'
  const categoryNo = text.slice(0, 400).match(CAT_RE)
  const reasons: string[] = []

  const eligibility: Eligibility = { qualifications: [], needsCheck: false }

  const method = text.match(/Method of appointment\s*[:\-–]?\s*(.{0,80})/i)?.[1] ?? ''
  if (IN_SERVICE.test(method)) eligibility.inServiceOnly = true

  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  if (latin < text.length * 0.3) reasons.push('Notification is mostly in Malayalam')

  // Qualification: options separated by "OR"; each option is classified to a level.
  // "Preferential" qualifications are optional, so they are ignored for matching.
  const required = qualification.split(/\bPreferential\b/i)[0]
  const positive = required.replace(NOT_ALLOWED, ' ')
  const levels = positive.split(/\bOR\b/).map(classify).filter((q): q is Qualification => q !== null)
  eligibility.qualifications = [...new Set(levels)]
  if (!qualification) reasons.push('Qualification section not found')
  else if (!eligibility.qualifications.length) reasons.push('Qualification type not recognised')

  for (const clause of required.match(NOT_ALLOWED) ?? []) {
    if (/degree|graduat/i.test(clause)) eligibility.notFor = ['Degree', 'B.Tech', 'Post Graduation']
  }

  const technical = eligibility.qualifications.some(q => q === 'B.Tech' || q === 'Diploma' || q === 'ITI')
  if (technical) {
    const branches = BRANCHES.filter(b => new RegExp(`\\b${b}`, 'i').test(required))
    if (branches.length) eligibility.streams = branches
    else reasons.push('Specific branch/trade required')
  }
  const general = eligibility.qualifications.some(q => q === 'Degree' || q === 'Post Graduation')
  if (general && !/any (discipline|subject|degree|branch)/i.test(required)) reasons.push('Specific degree subject required')
  // Extra conditions are shown to the user as notes; they do not make the match uncertain
  const notes: string[] = []
  if (/\d+\s*%|marks|\bclass\b/i.test(required)) notes.push('Minimum marks or class required')
  if (/experience/i.test(positive)) notes.push('Work experience required')
  if (/licen[cs]e|(must|should) (be|have)[^.]{0,30}regist|registration (with|in|under) the/i.test(positive)) notes.push('Licence or registration required')
  if (/certificate|training|course|KGTE|MGTE|typewriting|proficiency/i.test(positive)) notes.push('Extra certificate or course required')
  if (/physical|height|chest|swimming|driving|must be an?\b|ex-?servicem/i.test(positive)) notes.push('Physical or other special conditions')
  if (notes.length) eligibility.notes = notes

  // Age: prefer exact "born between" dates, fall back to "18 - 40"
  const DATE = String.raw`(\d{1,2})[./-](\d{1,2})[./-](\d{4})`
  const born = [...ageLimit.matchAll(new RegExp(`born between ${DATE} and ${DATE}`, 'gi'))]
  const range = ageLimit.match(/\b(1[4-9]|[2-5]\d)\s*[-–]\s*([2-6]\d)\b/)
  if (born.length) {
    // Several ranges = different limits per community; keep the widest and flag it
    eligibility.dobFrom = born.map(b => toIso(b[1], b[2], b[3])).sort()[0]
    eligibility.dobTo = born.map(b => toIso(b[4], b[5], b[6])).sort().at(-1)
    if (born.length > 1) reasons.push('Different age limits per community')
    if (born.length > 1 || /including the relaxation/i.test(ageLimit)) eligibility.relaxationIncluded = true
  } else if (range) {
    eligibility.minAge = Number(range[1])
    eligibility.maxAge = Number(range[2])
  } else if (/not applicable/i.test(ageLimit)) {
    const min = ageLimit.match(/completed (\d{2})/i)
    if (min) eligibility.minAge = Number(min[1])
  } else {
    reasons.push(ageLimit ? 'Age limit not understood' : 'Age limit section not found')
  }

  eligibility.needsCheck = reasons.length > 0
  if (reasons.length) eligibility.checkReasons = reasons

  return {
    qualification, ageLimit, pay, vacancies, eligibility,
    categoryNo: categoryNo ? `${categoryNo[1].replace(/\s+/g, '')}/${categoryNo[2]}` : '',
  }
}
