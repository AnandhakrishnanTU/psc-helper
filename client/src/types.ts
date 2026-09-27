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
}

export type NotifyChannel = 'email' | 'whatsapp' | 'push'

export interface Subscription {
  profile: UserProfile
  channel: NotifyChannel
  contact?: string
  push?: PushSubscriptionJSON
}
