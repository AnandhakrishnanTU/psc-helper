import { z } from 'zod'
import { COMMUNITIES, QUALIFICATIONS } from './types.js'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => !Number.isNaN(Date.parse(s)), 'Invalid date')

export const profileSchema = z.object({
  qualification: z.enum(QUALIFICATIONS),
  stream: z.string().trim().max(60).optional(),
  dateOfBirth: isoDate.refine(s => {
    const year = Number(s.slice(0, 4))
    const now = new Date().getFullYear()
    return year >= now - 70 && year <= now - 14
  }, 'Date of birth looks wrong'),
  community: z.enum(COMMUNITIES as [string, ...string[]]).optional(),
})

// Stored alerts are for adults only (children's data needs parental consent under the DPDP Act)
export const alertProfileSchema = profileSchema.refine(p => {
  const adult = new Date()
  adult.setFullYear(adult.getFullYear() - 18)
  return p.dateOfBirth <= adult.toISOString().slice(0, 10)
}, { message: 'Alerts are available for people aged 18 or over.', path: ['dateOfBirth'] })

// Only real browser push services, so the server cannot be made to call arbitrary URLs
const PUSH_HOSTS = [
  'fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com',
  'web.push.apple.com', 'notify.windows.com',
]

const pushSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000).refine(url => {
    const host = new URL(url).hostname
    return PUSH_HOSTS.some(h => host === h || host.endsWith(`.${h}`))
  }, 'Unsupported push service'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
})

// `website` is a hidden honeypot field: real users never fill it, bots usually do
const spamGuard = { website: z.string().max(0, 'Spam detected').optional(), consent: z.literal(true) }

export const subscribeSchema = z.discriminatedUnion('channel', [
  z.object({ channel: z.literal('email'), contact: z.email().max(200).toLowerCase(), profile: alertProfileSchema, ...spamGuard }),
  z.object({ channel: z.literal('push'), push: pushSchema, profile: alertProfileSchema, ...spamGuard }),
])

export const pushRenewSchema = z.object({ oldEndpoint: z.string().max(1000), push: pushSchema })

export const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/)

export const emailOnlySchema = z.object({ email: z.email().max(200).toLowerCase(), website: z.string().max(0).optional() })

const qualificationList = z.array(z.enum(QUALIFICATIONS))

// What the admin can change on a job
export const jobEditSchema = z.object({
  title: z.string().min(1).max(300),
  department: z.string().max(300),
  qualification: z.string().max(5000),
  ageLimit: z.string().max(5000),
  pay: z.string().max(200),
  vacancies: z.string().max(200),
  lastDate: isoDate,
  eligibility: z.object({
    qualifications: qualificationList,
    notFor: qualificationList.optional(),
    streams: z.array(z.string().trim().min(1).max(60)).optional(),
    dobFrom: isoDate.optional(),
    dobTo: isoDate.optional(),
    minAge: z.number().int().min(0).max(100).optional(),
    maxAge: z.number().int().min(0).max(100).optional(),
    relaxationIncluded: z.boolean().optional(),
    communities: z.array(z.enum(COMMUNITIES as [string, ...string[]])).optional(),
    inServiceOnly: z.boolean().optional(),
    needsCheck: z.boolean(),
    checkReasons: z.array(z.string().max(200)).optional(),
    notes: z.array(z.string().trim().min(1).max(200)).optional(),
  }),
})
