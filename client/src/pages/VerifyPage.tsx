import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifySubscription } from '../api'
import { addDeviceAlert } from '../deviceAlerts'

// Confirms an email sign-up. Done with JavaScript on page load (not on plain link open),
// so email link scanners cannot confirm alerts on someone's behalf.
export default function VerifyPage() {
  const [params] = useSearchParams()
  const [state, setState] = useState<{ token?: string; error?: string }>({})
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    verifySubscription(params.get('token') ?? '')
      .then(({ token }) => {
        addDeviceAlert({ token, label: 'Email alert' })
        setState({ token })
      })
      .catch(err => setState({ error: err.message }))
  }, [params])

  if (state.error) return <p className="error">{state.error}</p>
  if (!state.token) return <p>Confirming…</p>
  return (
    <>
      <h2>Your email alerts are on</h2>
      <p className="success">You will get an email now with the jobs that are already open for you, and again whenever a new matching job is published.</p>
      <p>Every email has a link to change your details or unsubscribe. You can also <Link to={`/manage/${state.token}`}>manage this alert now</Link>.</p>
    </>
  )
}
