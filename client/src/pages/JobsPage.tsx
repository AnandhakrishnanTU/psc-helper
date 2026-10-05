import { useState } from 'react'
import { Link } from 'react-router-dom'
import { findMatchingJobs } from '../api'
import JobCard from '../JobCard'
import ProfileFields, { emptyProfile } from '../ProfileFields'
import type { Job, UserProfile } from '../types'

// The search profile is remembered on this device only, never sent anywhere except to search
const KEY = 'govjoli-profile'
const savedProfile = (): UserProfile => {
  try {
    return { ...emptyProfile, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return emptyProfile
  }
}

export default function JobsPage() {
  const [profile, setProfile] = useState(savedProfile)
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      localStorage.setItem(KEY, JSON.stringify(profile))
      setJobs(await findMatchingJobs(profile))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load jobs. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const eligible = jobs?.filter(j => !j.needsCheck) ?? []
  const check = jobs?.filter(j => j.needsCheck && !j.subjectMismatch) ?? []
  const other = jobs?.filter(j => j.needsCheck && j.subjectMismatch) ?? []

  return (
    <>
      <h2>Find open PSC jobs you can apply for</h2>
      <form onSubmit={handleSubmit}>
        <ProfileFields profile={profile} onChange={setProfile} />
        <button type="submit" disabled={loading}>{loading ? 'Searching…' : 'Find jobs'}</button>
      </form>

      {error && <p className="error">{error}</p>}
      {jobs && (
        <p className="muted">
          {jobs.length ? `${jobs.length} open job(s) found.` : 'No matching open jobs right now.'}{' '}
          <Link to="/alerts">Get an alert when a new matching job is published</Link>.
        </p>
      )}

      {eligible.length > 0 && <h3>You meet the qualification and age limit ({eligible.length})</h3>}
      {eligible.map(job => <JobCard key={job.id} job={job} />)}

      {check.length > 0 && <h3>You may be eligible: check the notification ({check.length})</h3>}
      {check.map(job => <JobCard key={job.id} job={job} />)}

      {other.length > 0 && (
        <details className="other-jobs">
          <summary>Jobs needing a different subject, probably not for you ({other.length})</summary>
          {other.map(job => <JobCard key={job.id} job={job} />)}
        </details>
      )}
    </>
  )
}
