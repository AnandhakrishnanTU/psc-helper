import type {
  AdminJob, AdminJobRecord, AdminSummary, Job, JobStatus, SubscribeRequest, SubscriptionDetails, UserProfile,
} from './types'

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status)
  return data as T
}

// Remove empty optional fields so the server's validation sees "not given"
function cleanProfile(p: UserProfile): UserProfile {
  return {
    qualification: p.qualification,
    dateOfBirth: p.dateOfBirth,
    ...(p.stream?.trim() ? { stream: p.stream.trim() } : {}),
    ...(p.community ? { community: p.community } : {}),
  }
}

export const getConfig = () => request<{ pushPublicKey: string; emailEnabled: boolean }>('GET', '/api/config')

export const findMatchingJobs = (profile: UserProfile) => request<Job[]>('POST', '/api/jobs/match', cleanProfile(profile))

export const subscribe = (req: SubscribeRequest) =>
  request<{ ok: boolean; token?: string; needsVerification?: boolean }>('POST', '/api/subscriptions', { ...req, profile: cleanProfile(req.profile) })

export const verifySubscription = (token: string) => request<{ token: string }>('POST', '/api/subscriptions/verify', { token })

export const getSubscription = (token: string) => request<SubscriptionDetails>('GET', `/api/subscriptions/${token}`)

export const updateSubscription = (token: string, profile: UserProfile) =>
  request('PUT', `/api/subscriptions/${token}`, { profile: cleanProfile(profile) })

export const deleteSubscription = (token: string) => request('DELETE', `/api/subscriptions/${token}`)

export const unsubscribe = (token: string) => request('POST', `/api/subscriptions/unsubscribe?token=${encodeURIComponent(token)}`)

export const sendManageLinks = (email: string, website: string) =>
  request('POST', '/api/subscriptions/send-links', { email, website })

/** Asks permission and returns this browser's push subscription. */
export async function getPushSubscription(): Promise<PushSubscriptionJSON> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('This browser does not support notifications. On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), then open it from there.')
  }
  if (await Notification.requestPermission() !== 'granted') {
    throw new Error('Notifications are blocked. Allow notifications for this site in your browser settings and try again.')
  }
  const { pushPublicKey } = await getConfig()
  if (!pushPublicKey) throw new Error('Mobile notifications are not available yet.')
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushPublicKey })
  return subscription.toJSON()
}

// ---------- Admin ----------

const admin = <T>(method: string, url: string, password: string, body?: unknown) =>
  request<T>(method, `/api/admin${url}`, body, { Authorization: `Bearer ${password}` })

export const adminApi = {
  summary: (pw: string) => admin<AdminSummary>('GET', '/summary', pw),
  jobs: (pw: string, filter: 'review' | 'open' | 'all') => admin<AdminJobRecord[]>('GET', `/jobs?filter=${filter}`, pw),
  saveJob: (pw: string, job: AdminJob) => admin<AdminJobRecord>('PUT', `/jobs/${encodeURIComponent(job.id)}`, pw, {
    title: job.title, department: job.department, qualification: job.qualification, ageLimit: job.ageLimit,
    pay: job.pay, vacancies: job.vacancies, lastDate: job.lastDate, eligibility: job.eligibility,
  }),
  setStatus: (pw: string, id: string, status: JobStatus) =>
    admin<AdminJobRecord>('POST', `/jobs/${encodeURIComponent(id)}/status`, pw, { status }),
  clearFlag: (pw: string, id: string) => admin<AdminJobRecord>('POST', `/jobs/${encodeURIComponent(id)}/clear-flag`, pw),
  checkNow: (pw: string) => admin('POST', '/check-now', pw),
  sendAlertsNow: (pw: string) => admin('POST', '/send-alerts-now', pw),
  async downloadBackup(pw: string) {
    const res = await fetch('/api/admin/backup', { headers: { Authorization: `Bearer ${pw}` } })
    if (!res.ok) throw new ApiError('Backup failed', res.status)
    const url = URL.createObjectURL(await res.blob())
    const a = Object.assign(document.createElement('a'), { href: url, download: `psc-helper-${new Date().toISOString().slice(0, 10)}.db` })
    a.click()
    URL.revokeObjectURL(url)
  },
}
