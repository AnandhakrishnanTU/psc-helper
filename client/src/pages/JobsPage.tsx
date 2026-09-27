import { useState } from 'react'
import { findMatchingJobs } from '../api'
import ProfileFields, { emptyProfile } from '../ProfileFields'
import type { Job } from '../types'

export default function JobsPage() {
  const [profile, setProfile] = useState(emptyProfile)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      setJobs(await findMatchingJobs(profile))
    } catch {
      setError('Could not load jobs. Try again.')
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <ProfileFields profile={profile} onChange={setProfile} />
        <button type="submit">Find jobs</button>
      </form>

      {error && <p>{error}</p>}
      {jobs?.length === 0 && <p>No matching openings right now.</p>}
      {jobs?.map(job => (
        <div className="card" key={job.id}>
          <h3>{job.title}</h3>
          {job.needsCheck && <span className="badge">Check eligibility in notification</span>}
          <div>Cat. No: {job.categoryNo} · {job.department}</div>
          {job.pay && <div>Pay: {job.pay}</div>}
          {job.vacancies && <div>Vacancies: {job.vacancies}</div>}
          <div>Last date: {new Date(job.lastDate).toLocaleDateString('en-IN')}</div>
          <details>
            <summary>Qualification & age limit</summary>
            <p>{job.qualification}</p>
            <p>{job.ageLimit}</p>
          </details>
          <a href={job.notificationUrl} target="_blank" rel="noreferrer">View PSC notification</a>
        </div>
      ))}
    </>
  )
}
