import { COMMUNITIES, QUALIFICATIONS, type UserProfile } from './types'

interface Props {
  profile: UserProfile
  onChange: (profile: UserProfile) => void
}

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
      </label>
      <label>
        Stream / Branch / Trade
        <input value={profile.stream ?? ''} onChange={e => set('stream', e.target.value)} placeholder="e.g. Civil, Electrician" />
      </label>
      <label>
        Date of birth
        <input type="date" required value={profile.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
      </label>
      <label>
        Community
        <select value={profile.community ?? ''} onChange={e => set('community', e.target.value)}>
          {COMMUNITIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
    </>
  )
}

export const emptyProfile: UserProfile = { qualification: '', dateOfBirth: '' }
