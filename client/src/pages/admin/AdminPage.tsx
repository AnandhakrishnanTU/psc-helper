import { useCallback, useEffect, useState } from 'react'
import { adminApi, ApiError } from '../../api'
import type { AdminJob, AdminJobRecord, AdminSummary, JobStatus } from '../../types'
import JobEditor from './JobEditor'

const KEY = 'psc-helper-admin'
type Filter = 'review' | 'open' | 'all'

const STATUS_LABEL: Record<JobStatus, string> = {
  pending: 'Waiting for review', approved: 'Live', rejected: 'Rejected', cancelled: 'Cancelled',
}

const when = (iso: string | null) => (iso ? new Date(iso.includes('T') ? iso : `${iso}Z`).toLocaleString('en-IN') : 'never')

export default function AdminPage() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(KEY) ?? '')
  const [loggedIn, setLoggedIn] = useState(false)
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [jobs, setJobs] = useState<AdminJobRecord[]>([])
  const [filter, setFilter] = useState<Filter>('review')
  const [open, setOpen] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const load = useCallback(async (pw = password, f = filter) => {
    try {
      const [s, j] = await Promise.all([adminApi.summary(pw), adminApi.jobs(pw, f)])
      setSummary(s)
      setJobs(j)
      setLoggedIn(true)
      sessionStorage.setItem(KEY, pw)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        sessionStorage.removeItem(KEY)
        setLoggedIn(false)
      }
      setMessage(err instanceof Error ? err.message : 'Failed to load')
    }
  }, [password, filter])

  useEffect(() => {
    if (password) void load()
    // Only on first open, with a password saved earlier in this browser tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!loggedIn) {
    return (
      <form onSubmit={e => { e.preventDefault(); setMessage(''); void load() }}>
        <h2>Admin</h2>
        <label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button type="submit">Log in</button>
        {message && <p className="error">{message}</p>}
      </form>
    )
  }

  async function act(label: string, action: () => Promise<unknown>) {
    setMessage('')
    try {
      await action()
      setMessage(label)
      await load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed')
    }
  }

  const replace = (r: AdminJobRecord) => setJobs(list => list.map(x => (x.job.id === r.job.id ? { ...r, updates: x.updates } : x)))
  const save = async (job: AdminJob) => {
    replace(await adminApi.saveJob(password, job))
    setMessage('Saved')
  }
  const setStatus = async (id: string, status: JobStatus, job?: AdminJob) => {
    if (job) await adminApi.saveJob(password, job)
    await adminApi.setStatus(password, id, status)
    setMessage(status === 'approved' ? 'Approved. Alerts go out in about 2 minutes.' : `Marked as ${STATUS_LABEL[status]}`)
    setOpen(null)
    await load()
  }

  const s = summary!
  const setupWarnings = [
    !s.setup.email && 'Email (SMTP) is not configured: email alerts are off.',
    !s.setup.push && 'VAPID keys are not set: phone notifications are off.',
    !s.setup.adminEmail && 'ADMIN_EMAIL is not set: you will not be told about new jobs or errors.',
  ].filter(Boolean)
  const lastRun = s.runs[0]

  return (
    <>
      <h2>Admin</h2>
      {setupWarnings.map(w => <p key={w as string} className="badge danger">{w}</p>)}

      <div className="stats">
        <div><b>{s.stats.pendingJobs}</b> to review</div>
        <div><b>{s.stats.flaggedJobs}</b> flagged</div>
        <div><b>{s.stats.openJobs}</b> live &amp; open</div>
        <div><b>{s.stats.emailSubscribers}</b> email</div>
        <div><b>{s.stats.pushSubscribers}</b> push</div>
        <div><b>{s.stats.unverified}</b> unconfirmed</div>
      </div>

      <p className="muted">
        Last successful PSC check: {when(s.lastSuccessfulCheck)}.
        {lastRun && !lastRun.ok && <span className="error"> Last check had errors: {lastRun.errors.join(' | ')}</span>}
      </p>
      <div className="actions">
        <button onClick={() => act('PSC check started. Refresh in a few minutes.', () => adminApi.checkNow(password))}>Check PSC now</button>
        <button className="secondary" onClick={() => act('Alerts sent', () => adminApi.sendAlertsNow(password))}>Send pending alerts now</button>
        <button className="secondary" onClick={() => act('Backup downloaded', () => adminApi.downloadBackup(password))}>Download database backup</button>
        <button className="secondary" onClick={() => void load()}>Refresh</button>
        <button className="secondary" onClick={() => { sessionStorage.removeItem(KEY); setLoggedIn(false); setPassword('') }}>Log out</button>
      </div>
      {message && <p className="success">{message}</p>}

      <div className="tabs">
        {(['review', 'open', 'all'] as Filter[]).map(f => (
          <button key={f} className={f === filter ? '' : 'secondary'} onClick={() => { setFilter(f); setOpen(null); void load(password, f) }}>
            {{ review: 'To review', open: 'Live', all: 'All' }[f]}
          </button>
        ))}
      </div>

      {jobs.length === 0 && <p>Nothing here.</p>}
      {jobs.map(r => (
        <div key={r.job.id} className="card">
          <div className="row" onClick={() => setOpen(open === r.job.id ? null : r.job.id)}>
            <div>
              <b>{r.job.title}</b>
              <div className="muted">{r.job.department} · Cat. {r.job.categoryNo} · last date {r.job.lastDate}</div>
            </div>
            <div className="right">
              <span className={r.status === 'approved' ? 'badge ok' : 'badge'}>{STATUS_LABEL[r.status]}</span>
              {r.flag && <span className="badge danger">Flagged</span>}
            </div>
          </div>
          {open === r.job.id && (
            <JobEditor
              key={r.updatedAt}
              record={r}
              onSave={save}
              onStatus={(status, job) => setStatus(r.job.id, status, job)}
              onClearFlag={async () => { replace(await adminApi.clearFlag(password, r.job.id)); setMessage('Flag cleared') }}
            />
          )}
        </div>
      ))}
    </>
  )
}
