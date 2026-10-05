/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'PSC Helper', {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow(event.notification.data.url))
})

// Browsers sometimes replace the push subscription; tell the server so alerts keep arriving
self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const change = event as Event & { oldSubscription?: PushSubscription; newSubscription?: PushSubscription }
  const renew = async () => {
    const oldEndpoint = change.oldSubscription?.endpoint
    if (!oldEndpoint) return
    const next = change.newSubscription ?? await self.registration.pushManager.subscribe(
      change.oldSubscription!.options,
    )
    await fetch('/api/subscriptions/push-renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldEndpoint, push: next.toJSON() }),
    })
  }
  ;(event as ExtendableEvent).waitUntil(renew())
})
