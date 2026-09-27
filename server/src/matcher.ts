import { OBC_COMMUNITIES, type Job, type Qualification, type UserProfile } from './types.js'

// Qualifications a candidate is treated as holding, given their highest one
const IMPLIED: Record<Qualification, Qualification[]> = {
  'Below SSLC': ['Below SSLC'],
  'SSLC': ['Below SSLC', 'SSLC'],
  'Plus Two': ['Below SSLC', 'SSLC', 'Plus Two'],
  'ITI': ['Below SSLC', 'SSLC', 'ITI'],
  'Diploma': ['Below SSLC', 'SSLC', 'Diploma'],
  'Degree': ['Below SSLC', 'SSLC', 'Plus Two', 'Degree'],
  'B.Tech': ['Below SSLC', 'SSLC', 'Plus Two', 'Degree', 'B.Tech'],
  'Post Graduation': ['Below SSLC', 'SSLC', 'Plus Two', 'Degree', 'Post Graduation'],
}

function ageRelaxation(community = ''): number {
  if (community === 'SC' || community === 'ST') return 5
  if (OBC_COMMUNITIES.includes(community)) return 3
  return 0
}

function shiftYears(isoDate: string, years: number) {
  const d = new Date(isoDate)
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

function ageOn(dateOfBirth: string, on: Date): number {
  const dob = new Date(dateOfBirth)
  let age = on.getFullYear() - dob.getFullYear()
  if (on < new Date(on.getFullYear(), dob.getMonth(), dob.getDate())) age--
  return age
}

export type MatchResult = 'yes' | 'maybe' | 'no'

export function checkEligibility(profile: UserProfile, job: Job): MatchResult {
  const e = job.eligibility
  const held = IMPLIED[profile.qualification] ?? []
  const community = profile.community ?? ''

  if (e.inServiceOnly) return 'no'

  if (e.communities?.length) {
    const ok = e.communities.includes(community) ||
      (e.communities.includes('OBC') && OBC_COMMUNITIES.includes(community))
    if (!ok) return 'no'
  }

  if (e.qualifications.length && !e.qualifications.some(q => held.includes(q))) return 'no'
  if (e.notFor?.some(q => held.includes(q))) return 'no'

  let result: MatchResult = e.needsCheck ? 'maybe' : 'yes'

  if (e.streams?.length && e.qualifications.includes(profile.qualification)) {
    const stream = profile.stream?.trim().toLowerCase()
    if (!stream) result = 'maybe'
    else if (!e.streams.some(s => s.toLowerCase().includes(stream) || stream.includes(s.toLowerCase()))) return 'no'
  }

  const relax = e.relaxationIncluded ? 0 : ageRelaxation(community)
  if (e.dobFrom && e.dobTo) {
    if (profile.dateOfBirth < shiftYears(e.dobFrom, -relax) || profile.dateOfBirth > e.dobTo) return 'no'
  } else if (e.maxAge) {
    // Age is reckoned as on 1st January of the notification year
    const year = Number(job.categoryNo.split('/')[1]) || new Date().getFullYear()
    const age = ageOn(profile.dateOfBirth, new Date(year, 0, 1))
    if (age < (e.minAge ?? 0) || age > e.maxAge + relax) return 'no'
  }

  return result
}
