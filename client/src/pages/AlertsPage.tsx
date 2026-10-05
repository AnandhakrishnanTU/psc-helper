import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getConfig, getPushSubscription, subscribe } from '../api'
import { addDeviceAlert, getDeviceAlerts } from '../deviceAlerts'
import ProfileFields, { emptyProfile } from '../ProfileFields'
import type { NotifyChannel } from '../types'

export default function AlertsPage() {
  const [profile, setProfile] = useState(emptyProfile)
  const [channel, setChannel] = useState<NotifyChannel>('push')
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot, hidden from people
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [deviceAlerts, setDeviceAlerts] = useState(getDeviceAlerts)

  useEffect(() => {
    getConfig().then(c => setEmailEnabled(c.emailEnabled)).catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    setBusy(true)
    try {
      const label = `${profile.qualification}${profile.stream ? ` (${profile.stream})` : ''}`
      if (channel === 'push') {
        const res = await subscribe({ profile, channel, push: await getPushSubscription(), consent, website })
        if (res.token) addDeviceAlert({ token: res.token, label: `${label}, notifications on this device` })
        setStatus({ ok: true, text: 'Done! Notifications are on. You will get a first notification in a minute.' })
      } else {
        await subscribe({ profile, channel, contact: email, consent, website })
        setStatus({ ok: true, text: `Almost done: we sent a confirmation link to ${email}. Open it to start the alerts (check Spam too).` })
      }
      setDeviceAlerts(getDeviceAlerts())
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : 'Could not save. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2>Get alerts for new matching PSC jobs</h2>
      <p className="muted">We check the Kerala PSC website every 3 hours. When a new job you can apply for is published, we tell you.</p>

      {deviceAlerts.length > 0 && (
        <div className="card">
          <b>Alerts on this device</b>
          <ul>
            {deviceAlerts.map(a => <li key={a.token}><Link to={`/manage/${a.token}`}>{a.label}</Link></li>)}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <ProfileFields profile={profile} onChange={setProfile} />
        <fieldset>
          <legend>Notify me by</legend>
          <label className="inline">
            <input type="radio" name="channel" checked={channel === 'push'} onChange={() => setChannel('push')} />
            Notification on this phone / computer
          </label>
          <label className="inline">
            <input type="radio" name="channel" checked={channel === 'email'} disabled={!emailEnabled} onChange={() => setChannel('email')} />
            Email {!emailEnabled && '(coming soon)'}
          </label>
          <label className="inline">
            <input type="radio" name="channel" disabled /> WhatsApp (coming soon)
          </label>
        </fieldset>
        {channel === 'push' && (
          <small>On iPhone, first add this app to your Home Screen (Share → Add to Home Screen) and open it from there.</small>
        )}
        {channel === 'email' && (
          <label>
            Email
            <input type="email" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} />
          </label>
        )}

        <label className="honeypot" aria-hidden="true">
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
        </label>

        <label className="inline">
          <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>I agree that PSC Helper stores these details to send me job alerts, as described in the{' '}
            <Link to="/privacy" target="_blank">privacy policy</Link>. I can delete them at any time.</span>
        </label>

        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Turn on alerts'}</button>
        {status && <p className={status.ok ? 'success' : 'error'}>{status.text}</p>}
      </form>

      <p className="muted">Already have alerts? <Link to="/manage">Change or delete them</Link>.</p>
    </>
  )
}
