import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteSubscription, getSubscription, sendManageLinks, updateSubscription } from '../api'
import { removeDeviceAlert } from '../deviceAlerts'
import ProfileFields from '../ProfileFields'
import type { SubscriptionDetails } from '../types'

export default function ManagePage() {
  const { token } = useParams()
  return token ? <ManageAlert token={token} /> : <RequestLinks />
}

function ManageAlert({ token }: { token: string }) {
  const navigate = useNavigate()
  const [sub, setSub] = useState<SubscriptionDetails | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    getSubscription(token).then(setSub).catch(err => setError(err.message))
  }, [token])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    try {
      await updateSubscription(token, sub!.profile)
      setMessage('Saved. Alerts now use your new details.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  async function remove() {
    if (!confirm('Delete this alert and all its saved details?')) return
    try {
      await deleteSubscription(token)
      removeDeviceAlert(token)
      navigate('/unsubscribe?done=1')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not delete.')
    }
  }

  if (error) {
    return <><p className="error">{error}</p><Link to="/alerts">Create a new alert</Link></>
  }
  if (!sub) return <p>Loading…</p>

  return (
    <>
      <h2>Manage your alert</h2>
      <p className="muted">
        Sending to: {sub.channel === 'email' ? sub.contact : 'notifications on the device where you turned them on'}
        {!sub.verified && ' (waiting for email confirmation)'}
      </p>
      <form onSubmit={save}>
        <ProfileFields profile={sub.profile} onChange={profile => setSub({ ...sub, profile })} />
        <button type="submit">Save changes</button>
        {message && <p>{message}</p>}
      </form>
      <button className="danger" onClick={remove}>Delete this alert and my data</button>
    </>
  )
}

function RequestLinks() {
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await sendManageLinks(email, website)
      setMessage('If this email has alerts, we have sent it the links to manage them.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not send.')
    }
  }

  return (
    <>
      <h2>Manage your alerts</h2>
      <p>Every alert email has "Change your details" and "Unsubscribe" links at the bottom. Lost them? Enter your email and we will send them again.</p>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="honeypot" aria-hidden="true">
          Website <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
        </label>
        <button type="submit">Send me the links</button>
        {message && <p className="success">{message}</p>}
      </form>
      <p className="muted">For phone notifications: open this app on that phone and go to Alerts, or turn notifications off for this site in the browser settings.</p>
    </>
  )
}
