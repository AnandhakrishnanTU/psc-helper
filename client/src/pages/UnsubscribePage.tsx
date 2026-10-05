import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { unsubscribe } from '../api'
import { removeDeviceAlert } from '../deviceAlerts'

// Asks for a click instead of unsubscribing on page open, so link scanners cannot unsubscribe people
export default function UnsubscribePage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [done, setDone] = useState(params.get('done') === '1')
  const [error, setError] = useState('')

  async function confirm() {
    try {
      await unsubscribe(token)
      removeDeviceAlert(token)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unsubscribe.')
    }
  }

  if (done) {
    return (
      <>
        <h2>You are unsubscribed</h2>
        <p>Your alert and the details saved with it have been deleted. You will not get any more messages for it.</p>
        <Link to="/">Back to job search</Link>
      </>
    )
  }
  return (
    <>
      <h2>Unsubscribe from PSC job alerts?</h2>
      <p>This deletes the alert and the details saved with it.</p>
      <button className="danger" onClick={confirm}>Yes, unsubscribe</button>{' '}
      <Link to={`/manage/${token}`}>Change my details instead</Link>
      {error && <p className="error">{error}</p>}
    </>
  )
}
