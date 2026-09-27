import type { Job, Subscription, UserProfile } from './types'

async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  return res.json()
}

export const findMatchingJobs = (profile: UserProfile) =>
  request<Job[]>('/api/jobs/match', profile)

export const subscribe = (subscription: Subscription) =>
  request<{ ok: boolean }>('/api/subscriptions', subscription)

/** Asks permission and returns this browser's push subscription. */
export async function getPushSubscription(): Promise<PushSubscriptionJSON> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('This browser does not support notifications. On iPhone, add the app to the Home Screen first.')
  }
  if (await Notification.requestPermission() !== 'granted') {
    throw new Error('Notification permission was denied.')
  }
  const { key } = await request<{ key: string }>('/api/push/public-key')
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  return subscription.toJSON()
}
