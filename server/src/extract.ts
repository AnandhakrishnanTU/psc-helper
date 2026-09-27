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

function toIso(d: string, m: string, y: string) {
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Text between a "N. Heading" and the next note / numbered section. */
function section(text: string, heading: RegExp): string {
  const start = text.search(heading)
  if (start < 0) return ''
  const rest = text.slice(start).replace(heading, '').replace(/^[\s:\-]+/, '')
  // Skip the first few characters: some notices put a "Note:" label right after the heading
  const MIN = 20
  const end = rest.slice(MIN).search(/\b(Note\s*[:(\-]|LINK\b|\d{1,2}\s*\.\s+[A-Z][a-z]+\s*(of|:))/)
  return rest.slice(0, end >= 0 ? end + MIN : 1200).trim()
}

function classify(option: string): Qualification | null {
  const t = option
  if (/master'?s? degree|post ?graduat|\bM\.?\s?(A|Sc|Com|Tech|E|Phil)\b\.?/i.test(t)) return 'Post Graduation'
  if (/\bB\.?\s?Tech\b|\bB\.?\s?E\b\.|degree in \w*\s*engineering|engineering degree/i.test(t)) return 'B.Tech'
  if (/\bdegree\b|graduat|\bB\.?\s?(A|Sc|Com)\b\.?/i.test(t)) return 'Degree'
  if (/diploma/i.test(t)) return 'Diploma'
  if (/\bITI\b|\bNTC\b|\bNAC\b|trade certificate/i.test(t)) return 'ITI'
  if (/plus two|higher secondary|\bHSE\b|pre-?degree/i.test(t)) return 'Plus Two'
  if (/\bSSLC\b|matriculation|10th standard/i.test(t)) return 'SSLC'
  if (/standard\s+(IV|V|VI|VII|VIII|IX)\b|literacy|read and write/i.test(t)) return 'Below SSLC'
  return null
}

/** Parses "Name (I NCA-Muslim) - Department (Cat.No.144/2026)" style titles. */
export function parseTitle(raw: string) {
  const text = raw.replace(/\s+/g, ' ').trim()
  const cat = text.match(/\(\s*Cat\.?\s*No\.?\s*([\d\-]+\/\d{4})\s*\)\s*$/i)
  const withoutCat = cat ? text.slice(0, cat.index).trim() : text
  const sep = withoutCat.lastIndexOf(' - ')
  const title = sep > 0 ? withoutCat.slice(0, sep).trim() : withoutCat
  const department = sep > 0 ? withoutCat.slice(sep + 3).trim() : ''

  let communities: string[] | undefined
  const nca = title.match(/NCA\s*-\s*([^)]+)\)/i)
  const sr = title.match(/SR for ([^)]+)\)/i)
  const list = nca?.[1] ?? sr?.[1]
  if (list) {
    let rest = list
    const found = new Set<string>()
    // Match multi-part codes first so "LC/AI" is not split on "/"
    for (const code of Object.keys(COMMUNITY_CODES).sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`(^|/)\\s*${code.replace('/', '\\/')}\\s*(?=/|$)`, 'i')
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
    categoryNo: cat?.[1] ?? '',
    communities,
    inServiceOnly: /in-?service|society category|by transfer/i.test(title),
  }
}

export function extractDetails(pdfText: string) {
  const text = pdfText.replace(/\s+/g, ' ')

  const qualification = section(text, /\b\d{1,2}\s*\.\s*(Educational\s+)?Qualifications?\b/i)
  const ageLimit = section(text, /\b\d{1,2}\s*\.\s*Age(\s*Limit)?\s*:/i)
  const pay = text.match(/Scale of pay\s*:?\s*(.+?)\s+\d{1,2}\s*\.\s/i)?.[1] ?? ''
  let vacancies = text.match(/Number of vacancies\s*:?\s*(.+?)\s+(The |\d{1,2}\s*\.\s)/i)?.[1] ?? ''
  if (vacancies.length > 40) vacancies = 'See notification'

  const eligibility: Eligibility = { qualifications: [], needsCheck: false }

  const method = text.match(/Method of appointment\s*:?\s*(.{0,80})/i)?.[1] ?? ''
  if (/in[- ]?service|by transfer/i.test(method)) eligibility.inServiceOnly = true

  // Qualification: options separated by "OR"; each option is classified to a level
  // "Preferential" qualifications are optional, so ignore them for matching
  const required = qualification.split(/\bPreferential\b/i)[0]
  const levels = required.split(/\bOR\b/).map(classify).filter((q): q is Qualification => q !== null)
  eligibility.qualifications = [...new Set(levels)]
  if (!eligibility.qualifications.length) eligibility.needsCheck = true

  if (/must not have (passed|acquired)[^.]*degree/i.test(text)) {
    eligibility.notFor = ['Degree', 'B.Tech', 'Post Graduation']
  }

  const technical = eligibility.qualifications.some(q => q === 'B.Tech' || q === 'Diploma' || q === 'ITI')
  if (technical) {
    const branches = BRANCHES.filter(b => new RegExp(`\\b${b}`, 'i').test(required))
    if (branches.length) eligibility.streams = branches
    else eligibility.needsCheck = true
  }
  // Degree in a specific subject cannot be matched reliably yet
  const general = eligibility.qualifications.some(q => q === 'Degree' || q === 'Post Graduation')
  if (general && !/any (discipline|subject|degree)/i.test(required)) eligibility.needsCheck = true

  // Age: prefer exact "born between" dates, fall back to "18 - 40"
  const born = [...ageLimit.matchAll(/born between (\d{1,2})\.(\d{1,2})\.(\d{4}) and (\d{1,2})\.(\d{1,2})\.(\d{4})/gi)]
  const range = ageLimit.match(/(\d{2})\s*-\s*(\d{2})/)
  if (born.length) {
    // Several ranges = different limits per community; keep the widest and flag it
    eligibility.dobFrom = born.map(b => toIso(b[1], b[2], b[3])).sort()[0]
    eligibility.dobTo = born.map(b => toIso(b[4], b[5], b[6])).sort().at(-1)
    if (born.length > 1) eligibility.needsCheck = true
    if (born.length > 1 || /including the relaxation/i.test(ageLimit)) eligibility.relaxationIncluded = true
  } else if (range) {
    eligibility.minAge = Number(range[1])
    eligibility.maxAge = Number(range[2])
  } else if (!/not applicable/i.test(ageLimit)) {
    eligibility.needsCheck = true
  }

  return { qualification, ageLimit, pay, vacancies, eligibility }
}
