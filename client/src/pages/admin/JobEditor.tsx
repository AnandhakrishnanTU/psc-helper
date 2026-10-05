import { useState } from 'react'
import { COMMUNITIES, QUALIFICATIONS, type AdminJob, type AdminJobRecord, type Eligibility, type JobStatus } from '../../types'

interface Props {
  record: AdminJobRecord
  onSave: (job: AdminJob) => Promise<void>
  onStatus: (status: JobStatus, job?: AdminJob) => Promise<void>
  onClearFlag: () => Promise<void>
}

const list = (text: string) => text.split(/[,\n]/).map(s => s.trim()).filter(Boolean)
const num = (text: string) => (text.trim() ? Number(text) : undefined)
const blank = (text: string) => text.trim() || undefined

function Checkboxes({ options, value, onChange }: { options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="checks">
      {options.map(o => (
        <label key={o} className="inline">
          <input type="checkbox" checked={value.includes(o)}
            onChange={e => onChange(e.target.checked ? [...value, o] : value.filter(v => v !== o))} />
          {o}
        </label>
      ))}
    </div>
  )
}

export default function JobEditor({ record, onSave, onStatus, onClearFlag }: Props) {
  const [job, setJob] = useState(record.job)
  const [streams, setStreams] = useState((job.eligibility.streams ?? []).join(', '))
  const [notes, setNotes] = useState((job.eligibility.notes ?? []).join('\n'))
  const [ages, setAges] = useState({ min: String(job.eligibility.minAge ?? ''), max: String(job.eligibility.maxAge ?? '') })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const e = job.eligibility
  const setField = (key: keyof AdminJob, value: string) => setJob({ ...job, [key]: value })
  const setElig = (changes: Partial<Eligibility>) => setJob({ ...job, eligibility: { ...e, ...changes } })

  // Builds the job from the form, dropping empty optional fields
  function current(): AdminJob {
    const streamList = list(streams)
    const noteList = notes.split('\n').map(s => s.trim()).filter(Boolean)
    return {
      ...job,
      eligibility: {
        ...e,
        streams: streamList.length ? streamList : undefined,
        notes: noteList.length ? noteList : undefined,
        notFor: e.notFor?.length ? e.notFor : undefined,
        communities: e.communities?.length ? e.communities : undefined,
        dobFrom: blank(e.dobFrom ?? ''),
        dobTo: blank(e.dobTo ?? ''),
        minAge: num(ages.min),
        maxAge: num(ages.max),
        relaxationIncluded: e.relaxationIncluded || undefined,
        inServiceOnly: e.inServiceOnly || undefined,
      },
    }
  }

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor">
      <p>
        <a href={job.notificationUrl} target="_blank" rel="noreferrer"><b>Open the PSC notification PDF</b></a>{' '}
        and compare it with the fields below.
      </p>
      {record.flag && <p className="badge danger">Needs attention: {record.flag}</p>}
      {e.checkReasons?.length ? <p className="muted">Auto-read was unsure about: {e.checkReasons.join('; ')}</p> : null}
      {record.updates.length > 0 && (
        <ul>{record.updates.map(u => (
          <li key={u.createdAt + u.title}>{u.kind}: {u.url ? <a href={u.url} target="_blank" rel="noreferrer">{u.title}</a> : u.title}</li>
        ))}</ul>
      )}

      <div className="grid2">
        <label>Title<input value={job.title} onChange={ev => setField('title', ev.target.value)} /></label>
        <label>Department<input value={job.department} onChange={ev => setField('department', ev.target.value)} /></label>
        <label>Last date<input type="date" value={job.lastDate} onChange={ev => setField('lastDate', ev.target.value)} /></label>
        <label>Pay<input value={job.pay} onChange={ev => setField('pay', ev.target.value)} /></label>
        <label>Vacancies<input value={job.vacancies} onChange={ev => setField('vacancies', ev.target.value)} /></label>
      </div>
      <label>Qualification text (shown to users)
        <textarea rows={4} value={job.qualification} onChange={ev => setField('qualification', ev.target.value)} />
      </label>
      <label>Age limit text (shown to users)
        <textarea rows={3} value={job.ageLimit} onChange={ev => setField('ageLimit', ev.target.value)} />
      </label>

      <h4>Matching rules</h4>
      <div>Accepted qualification levels (any one; higher levels include lower ones automatically)</div>
      <Checkboxes options={QUALIFICATIONS} value={e.qualifications} onChange={v => setElig({ qualifications: v })} />
      <div>Not allowed (e.g. "must not have a degree")</div>
      <Checkboxes options={QUALIFICATIONS} value={e.notFor ?? []} onChange={v => setElig({ notFor: v })} />
      <label>Required subjects / branches / trades, comma separated (leave empty if any)
        <input value={streams} onChange={ev => setStreams(ev.target.value)} placeholder="e.g. Civil, Electrical" />
      </label>

      <div className="grid2">
        <label>Born on or after<input type="date" value={e.dobFrom ?? ''} onChange={ev => setElig({ dobFrom: ev.target.value })} /></label>
        <label>Born on or before<input type="date" value={e.dobTo ?? ''} onChange={ev => setElig({ dobTo: ev.target.value })} /></label>
        <label>Min age (if no dates)<input type="number" value={ages.min} onChange={ev => setAges({ ...ages, min: ev.target.value })} /></label>
        <label>Max age (if no dates)<input type="number" value={ages.max} onChange={ev => setAges({ ...ages, max: ev.target.value })} /></label>
      </div>
      <label className="inline">
        <input type="checkbox" checked={!!e.relaxationIncluded} onChange={ev => setElig({ relaxationIncluded: ev.target.checked })} />
        Age limits above already include community relaxation (no extra years added)
      </label>

      <div>Only for these communities (NCA / special recruitment). Leave all unticked for everyone.</div>
      <Checkboxes options={COMMUNITIES.filter(c => c.value).map(c => c.value)} value={e.communities ?? []}
        onChange={v => setElig({ communities: v })} />
      <label className="inline">
        <input type="checkbox" checked={!!e.inServiceOnly} onChange={ev => setElig({ inServiceOnly: ev.target.checked })} />
        Only for existing employees / by transfer / society category (hidden from users)
      </label>
      <label>Extra requirements shown to users, one per line
        <textarea rows={3} value={notes} onChange={ev => setNotes(ev.target.value)} />
      </label>
      <label className="inline">
        <input type="checkbox" checked={e.needsCheck} onChange={ev => setElig({ needsCheck: ev.target.checked })} />
        Show "Check in notification" to users (untick when the rules above are exact)
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button disabled={busy} onClick={() => run(() => onStatus('approved', current()))}>Save &amp; approve</button>
        <button disabled={busy} className="secondary" onClick={() => run(() => onSave(current()))}>Save only</button>
        {record.flag && <button disabled={busy} className="secondary" onClick={() => run(onClearFlag)}>Mark as checked</button>}
        {record.status !== 'pending' && <button disabled={busy} className="secondary" onClick={() => run(() => onStatus('pending'))}>Unpublish</button>}
        <button disabled={busy} className="danger" onClick={() => run(() => onStatus('rejected'))}>Reject (not a job)</button>
        <button disabled={busy} className="danger" onClick={() => run(() => onStatus('cancelled'))}>Cancelled by PSC</button>
      </div>
    </div>
  )
}
