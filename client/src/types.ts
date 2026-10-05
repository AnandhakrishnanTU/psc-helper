export const QUALIFICATIONS = ['Below SSLC', 'SSLC', 'Plus Two', 'ITI', 'Diploma', 'Degree', 'B.Tech', 'Post Graduation']

export const COMMUNITIES = [
  { value: '', label: 'General' },
  { value: 'Ezhava', label: 'Ezhava / Thiyya / Billava' },
  { value: 'Muslim', label: 'Muslim' },
  { value: 'LC/AI', label: 'Latin Catholic / Anglo Indian' },
  { value: 'Viswakarma', label: 'Viswakarma' },
  { value: 'SIUC Nadar', label: 'SIUC Nadar' },
  { value: 'Hindu Nadar', label: 'Hindu Nadar' },
  { value: 'Dheevara', label: 'Dheevara' },
  { value: 'OX', label: 'OBC Christian (OX)' },
  { value: 'SCCC', label: 'SC converted to Christianity (SCCC)' },
  { value: 'OBC', label: 'Other OBC' },
  { value: 'SC', label: 'SC' },
  { value: 'ST', label: 'ST' },
]

export interface UserProfile {
  qualification: string
  stream?: string
  dateOfBirth: string
  community?: string
}

export interface JobUpdate {
  kind: 'erratum' | 'addendum' | 'cancellation' | 'extension' | 'revised' | 'removed'
  title: string
  url?: string
  createdAt: string
}

export interface Job {
  id: string
  categoryNo: string
  title: string
  department: string
  qualification: string
  ageLimit: string
  pay: string
  vacancies: string
  lastDate: string
  notificationUrl: string
  needsCheck: boolean
  subjectMismatch: boolean
  checkReasons: string[]
  notes: string[]
  updates: JobUpdate[]
}

export type NotifyChannel = 'email' | 'push'

export interface SubscribeRequest {
  profile: UserProfile
  channel: NotifyChannel
  contact?: string
  push?: PushSubscriptionJSON
  consent: boolean
  website?: string // honeypot
}

export interface SubscriptionDetails {
  channel: NotifyChannel
  contact?: string
  profile: UserProfile
  verified: boolean
}

// ---------- Admin ----------

export interface Eligibility {
  qualifications: string[]
  notFor?: string[]
  streams?: string[]
  dobFrom?: string
  dobTo?: string
  minAge?: number
  maxAge?: number
  relaxationIncluded?: boolean
  communities?: string[]
  inServiceOnly?: boolean
  needsCheck: boolean
  checkReasons?: string[]
  notes?: string[]
}

export interface AdminJob {
  id: string
  categoryNo: string
  title: string
  department: string
  qualification: string
  ageLimit: string
  pay: string
  vacancies: string
  lastDate: string
  notificationUrl: string
  gazetteUrl?: string
  eligibility: Eligibility
}

export type JobStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface AdminJobRecord {
  job: AdminJob
  status: JobStatus
  flag: string | null
  createdAt: string
  updatedAt: string
  updates: JobUpdate[]
}

export interface AdminSummary {
  stats: {
    pendingJobs: number
    flaggedJobs: number
    openJobs: number
    emailSubscribers: number
    pushSubscribers: number
    unverified: number
  }
  runs: { startedAt: string; finishedAt: string | null; ok: boolean; newJobs: number; errors: string[] }[]
  lastSuccessfulCheck: string | null
  setup: { email: boolean; push: boolean; adminEmail: boolean; appUrl: string }
}
