import { COMMUNITIES, QUALIFICATIONS, type UserProfile } from './types'

interface Props {
  profile: UserProfile
  onChange: (profile: UserProfile) => void
}

const today = new Date().toISOString().slice(0, 10)

export default function ProfileFields({ profile, onChange }: Props) {
  const set = (key: keyof UserProfile, value: string) => onChange({ ...profile, [key]: value })

  return (
    <>
      <label>
        Highest qualification
        <select required value={profile.qualification} onChange={e => set('qualification', e.target.value)}>
          <option value="">Select</option>
          {QUALIFICATIONS.map(q => <option key={q}>{q}</option>)}
        </select>
        <small>Have both B.Tech and M.Tech? Choose B.Tech. MBBS, B.Ed, LLB etc. count as Degree.</small>
      </label>
      <label>
        Subject / Branch / Trade <span className="optional">(recommended)</span>
        <input maxLength={60} value={profile.stream ?? ''} onChange={e => set('stream', e.target.value)}
          placeholder="e.g. Commerce, Civil, Electrician, Chemistry" />
        <small>Helps us show posts that need your subject first.</small>
      </label>
      <label>
        Date of birth
        <input type="date" required min="1950-01-01" max={today} value={profile.dateOfBirth}
          onChange={e => set('dateOfBirth', e.target.value)} />
      </label>
      <label>
        Community <span className="optional">(optional)</span>
        <select value={profile.community ?? ''} onChange={e => set('community', e.target.value)}>
          {COMMUNITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <small>Used only for age relaxation and community-reserved (NCA) posts. Leave as General if you prefer not to say.</small>
      </label>
    </>
  )
}

export const emptyProfile: UserProfile = { qualification: '', dateOfBirth: '' }
