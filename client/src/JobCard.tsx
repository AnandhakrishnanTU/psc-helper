import type { Job } from './types'

const UPDATE_LABEL: Record<Job['updates'][number]['kind'], string> = {
  erratum: 'Erratum',
  addendum: 'Addendum',
  cancellation: 'Cancellation notice',
  extension: 'Date change',
  revised: 'Notification revised',
  removed: 'Removed from PSC list',
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

function daysLeft(lastDate: string) {
  const end = new Date(`${lastDate}T23:59:59+05:30`).getTime()
  return Math.ceil((end - Date.now()) / 86_400_000)
}

export default function JobCard({ job }: { job: Job }) {
  const days = daysLeft(job.lastDate)
  return (
    <article className="card">
      <h3>{job.title}</h3>
      <div className="muted">{job.department} · Cat. No. {job.categoryNo}</div>

      {job.updates.length > 0 && (
        <div className="updates">
          {job.updates.map((u, i) => (
            <div key={i} className={u.kind === 'cancellation' || u.kind === 'removed' ? 'badge danger' : 'badge'}>
              {UPDATE_LABEL[u.kind]}: {u.url ? <a href={u.url} target="_blank" rel="noreferrer">{u.title}</a> : u.title}
            </div>
          ))}
        </div>
      )}

      <div>
        Last date: <b>{formatDate(job.lastDate)}</b>{' '}
        <span className={days <= 3 ? 'badge danger' : 'muted'}>{days === 1 ? 'last day' : `${days} days left`}</span>
      </div>
      {job.pay && <div>Pay: {job.pay}</div>}
      {job.vacancies && <div>Vacancies: {job.vacancies}</div>}

      {job.checkReasons.length > 0 && (
        <div className="badge">Check in notification: {job.checkReasons.join('; ')}</div>
      )}
      {job.notes.length > 0 && <div className="muted">Also required: {job.notes.join('; ')}</div>}

      <details>
        <summary>Qualification &amp; age limit (as in notification)</summary>
        <p>{job.qualification || 'See notification.'}</p>
        <p>{job.ageLimit || 'See notification.'}</p>
      </details>
      <a className="button-link" href={job.notificationUrl} target="_blank" rel="noreferrer">Open official PSC notification</a>
    </article>
  )
}
