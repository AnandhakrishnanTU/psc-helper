export const QUALIFICATIONS = ['Below SSLC', 'SSLC', 'Plus Two', 'ITI', 'Diploma', 'Degree', 'B.Tech', 'Post Graduation'] as const
export type Qualification = (typeof QUALIFICATIONS)[number]

export const OBC_COMMUNITIES = ['Ezhava', 'Muslim', 'LC/AI', 'Viswakarma', 'SIUC Nadar', 'Hindu Nadar', 'Dheevara', 'OX', 'SCCC', 'OBC']
export const COMMUNITIES = ['', ...OBC_COMMUNITIES, 'SC', 'ST']

export interface UserProfile {
  qualification: Qualification
  stream?: string
  dateOfBirth: string // YYYY-MM-DD
  community?: string // '' = General, else one of OBC_COMMUNITIES, 'SC' or 'ST'
}

// Job as shown to users, plus structured eligibility fields used for matching
export interface Job {
  id: string
  categoryNo: string
  title: string
  department: string
  qualification: string // original PSC text
  ageLimit: string // original PSC text
  pay: string
  vacancies: string
  lastDate: string // YYYY-MM-DD
  notificationUrl: string
  gazetteUrl?: string
  eligibility: Eligibility
}

export interface Eligibility {
  qualifications: Qualification[] // any of these is accepted; empty = could not detect
  notFor?: Qualification[] // e.g. "must not have passed Degree"
  streams?: string[]
  dobFrom?: string // born on or after (before relaxation)
  dobTo?: string // born on or before
  minAge?: number
  maxAge?: number
  relaxationIncluded?: boolean // limits above already include community relaxation
  communities?: string[] // post reserved for these communities only
  inServiceOnly?: boolean
  needsCheck: boolean // extraction was uncertain, user is told to verify
  checkReasons?: string[] // why needsCheck was set
  notes?: string[] // extra conditions shown to the user, e.g. "Work experience required"
}

// pending: waiting for admin review; only approved jobs are shown and alerted
export type JobStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export type JobUpdateKind = 'erratum' | 'addendum' | 'cancellation' | 'extension' | 'revised' | 'removed'

export interface JobUpdate {
  id: number
  jobId: string
  kind: JobUpdateKind
  title: string
  url?: string
  createdAt: string
}

export interface JobRecord {
  job: Job
  status: JobStatus
  flag: string | null // reason the job needs admin attention
  createdAt: string
  updatedAt: string
}

export type NotifyChannel = 'email' | 'push'

export interface PushSubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface Subscription {
  id: number
  token: string // secret used in manage / unsubscribe links
  channel: NotifyChannel
  contact?: string // email
  push?: PushSubscriptionData
  profile: UserProfile
  verified: boolean
  verifyToken: string | null
  createdAt: string
}
