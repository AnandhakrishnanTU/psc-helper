// Regression tests on real PSC notification text. Run: npm test
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { categoryKeys, extractDetails, parseTitle } from './extract.js'
import { checkEligibility } from './matcher.js'
import type { Job, UserProfile } from './types.js'

const fixture = (name: string) =>
  extractDetails(fs.readFileSync(new URL(`./test-fixtures/${name}.txt`, import.meta.url), 'utf8'))

test('simple SSLC post with exact birth dates', () => {
  const d = fixture('laboratory-attender')
  assert.deepEqual(d.eligibility.qualifications, ['SSLC'])
  assert.equal(d.eligibility.dobFrom, '1986-01-02')
  assert.equal(d.eligibility.dobTo, '2008-01-01')
  assert.equal(d.eligibility.needsCheck, false)
  assert.match(d.pay, /23,700/)
})

test('different age limits per community are flagged', () => {
  const e = fixture('beat-forest-officer').eligibility
  assert.deepEqual(e.qualifications, ['Plus Two'])
  assert.equal(e.dobFrom, '1987-01-02')
  assert.equal(e.relaxationIncluded, true)
  assert.equal(e.needsCheck, true)
})

test('"should not have acquired Graduation" is an exclusion, not a requirement', () => {
  const e = fixture('ayah').eligibility
  assert.deepEqual(e.qualifications, ['Below SSLC'])
  assert.deepEqual(e.notFor, ['Degree', 'B.Tech', 'Post Graduation'])
})

test('"Pre-degree" is Plus Two level, not a degree', () => {
  const e = fixture('lp-school-teacher').eligibility
  assert.ok(!e.qualifications.includes('Degree'))
  assert.ok(e.qualifications.includes('Plus Two'))
  assert.equal(e.inServiceOnly, true) // recruitment by transfer
})

test('"from among candidates belonging to a community" is not in-service only', () => {
  const e = fixture('divisional-accounts-officer').eligibility
  assert.notEqual(e.inServiceOnly, true)
  assert.deepEqual(e.qualifications, ['Post Graduation']) // "M.com." in lower case
})

test('age range with en dash and "Age limit -" heading', () => {
  const e = fixture('compounder').eligibility
  assert.deepEqual(e.qualifications, ['Diploma'])
  assert.equal(e.dobFrom, '1986-01-02')
})

test('posts for existing employees are in-service only', () => {
  assert.equal(fixture('peon-watchman').eligibility.inServiceOnly, true)
  assert.equal(fixture('assistant-project-engineer').eligibility.inServiceOnly, true)
})

test('engineering branches are read', () => {
  assert.deepEqual(fixture('assistant-project-engineer').eligibility.streams, ['Civil', 'Agricultural'])
})

test('minimum age only, upper limit not applicable', () => {
  const e = fixture('architectural-assistant').eligibility
  assert.equal(e.minAge, 18)
  assert.equal(e.maxAge, undefined)
})

test('titles with community, department and category number', () => {
  const t = parseTitle('Beat Forest Officer (I NCA-LC/AI/Muslim/SC/SIUC Nadar/SCCC) - Forest and Wildlife (Cat.No.146-150/2026)')
  assert.equal(t.title, 'Beat Forest Officer (I NCA-LC/AI/Muslim/SC/SIUC Nadar/SCCC)')
  assert.equal(t.department, 'Forest and Wildlife')
  assert.equal(t.categoryNo, '146-150/2026')
  assert.deepEqual(new Set(t.communities), new Set(['LC/AI', 'Muslim', 'SC', 'SIUC Nadar', 'SCCC']))
})

test('category number typos in titles', () => {
  assert.equal(parseTitle('Clerk - Federation Ltd. (Ca.No.108&109/2026)').categoryNo, '108&109/2026')
  assert.equal(parseTitle('Overseer - Housing Board (at.No.461/2025)').categoryNo, '461/2025')
  assert.equal(parseTitle('Professor - Medical Education (Cat.90/2025)').categoryNo, '90/2025')
  assert.equal(parseTitle('Teacher (I NCA-LC/AI) - Education (264/2025)').categoryNo, '264/2025')
})

test('category keys expand ranges and lists and drop leading zeros', () => {
  assert.deepEqual(categoryKeys('CAT. NO. 017/2025'), ['17/2025'])
  assert.deepEqual(categoryKeys('Cat.No.139-142/2026'), ['139/2026', '140/2026', '141/2026', '142/2026'])
  assert.deepEqual(categoryKeys('Cat No.127&128/2026'), ['127/2026', '128/2026'])
})

// ---------- Matching ----------

const job = (eligibility: Partial<Job['eligibility']>): Job => ({
  id: '1/2026', categoryNo: '1/2026', title: 'Test', department: '', qualification: '', ageLimit: '', pay: '',
  vacancies: '', lastDate: '2099-01-01', notificationUrl: '',
  eligibility: { qualifications: ['SSLC'], needsCheck: false, dobFrom: '1986-01-02', dobTo: '2008-01-01', ...eligibility },
})
const person = (p: Partial<UserProfile>): UserProfile => ({ qualification: 'SSLC', dateOfBirth: '2000-01-01', ...p })

test('higher qualifications include lower ones', () => {
  assert.equal(checkEligibility(person({ qualification: 'Degree' }), job({})), 'yes')
  assert.equal(checkEligibility(person({ qualification: 'Below SSLC' }), job({})), 'no')
})

test('"must not have a degree" excludes graduates', () => {
  const j = job({ qualifications: ['Below SSLC'], notFor: ['Degree', 'B.Tech', 'Post Graduation'] })
  assert.equal(checkEligibility(person({ qualification: 'Plus Two' }), j), 'yes')
  assert.equal(checkEligibility(person({ qualification: 'Degree' }), j), 'no')
})

test('age limits with community relaxation', () => {
  const old = person({ dateOfBirth: '1984-06-01' }) // 2 years older than allowed
  assert.equal(checkEligibility(old, job({})), 'no')
  assert.equal(checkEligibility({ ...old, community: 'Ezhava' }, job({})), 'yes') // OBC +3
  assert.equal(checkEligibility({ ...old, community: 'Ezhava' }, job({ relaxationIncluded: true })), 'no')
  assert.equal(checkEligibility(person({ dateOfBirth: '2009-01-01' }), job({})), 'no') // too young
})

test('community-reserved posts', () => {
  const j = job({ communities: ['Muslim'] })
  assert.equal(checkEligibility(person({ community: 'Muslim' }), j), 'yes')
  assert.equal(checkEligibility(person({}), j), 'no')
  assert.equal(checkEligibility(person({ community: 'Dheevara' }), job({ communities: ['OBC'] })), 'yes')
})

test('branch must match for technical posts', () => {
  const j = job({ qualifications: ['ITI'], streams: ['Electrician'] })
  assert.equal(checkEligibility(person({ qualification: 'ITI', stream: 'electrician' }), j), 'yes')
  assert.equal(checkEligibility(person({ qualification: 'ITI', stream: 'Plumber' }), j), 'no')
  assert.equal(checkEligibility(person({ qualification: 'ITI' }), j), 'maybe')
})

test('in-service posts are never shown', () => {
  assert.equal(checkEligibility(person({}), job({ inServiceOnly: true })), 'no')
})
