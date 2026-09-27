import { useState } from 'react'
import { getPushSubscription, subscribe } from '../api'
import ProfileFields, { emptyProfile } from '../ProfileFields'
import type { NotifyChannel } from '../types'

export default function AlertsPage() {
  const [profile, setProfile] = useState(emptyProfile)
  const [channel, setChannel] = useState<NotifyChannel>('email')
  const [contact, setContact] = useState('')
  const [status, setStatus] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('')
    try {
      if (channel === 'push') await subscribe({ profile, channel, push: await getPushSubscription() })
      else await subscribe({ profile, channel, contact })
      setStatus('Alerts enabled. You will get a confirmation message shortly.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save. Try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <ProfileFields profile={profile} onChange={setProfile} />
      <label>
        Notify me by
        <select value={channel} onChange={e => setChannel(e.target.value as NotifyChannel)}>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="push">Mobile notification</option>
        </select>
      </label>
      {channel === 'email' && (
        <label>
          Email
          <input type="email" required value={contact} onChange={e => setContact(e.target.value)} />
        </label>
      )}
      {channel === 'whatsapp' && (
        <label>
          WhatsApp number
          <input type="tel" required value={contact} onChange={e => setContact(e.target.value)} placeholder="+91..." />
        </label>
      )}
      <button type="submit">Enable alerts</button>
      {status && <p>{status}</p>}
    </form>
  )
}
