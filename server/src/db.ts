import { todayIST } from './dates.js'
import { query, queryOne } from './sql.js'
import type { Job, JobRecord, JobStatus, JobUpdate, JobUpdateKind, PushSubscriptionData, Subscription, UserProfile } from './types.js'

type Row = Record<string, unknown>
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v))
const json = (v: unknown) => JSON.stringify(v)

// ---------- Jobs ----------

function toJobRecord(row: Row): JobRecord {
  return {
    job: row.data as Job,
    status: row.status as JobStatus,
    flag: (row.flag as string) ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export async function getJob(id: string): Promise<JobRecord | undefined> {
  const row = await queryOne('SELECT * FROM jobs WHERE id = $1', [id])
  return row ? toJobRecord(row) : undefined
}

/** Approved jobs whose last date has not passed. */
export async function getOpenJobs(): Promise<Job[]> {
  const rows = await query("SELECT * FROM jobs WHERE status = 'approved' AND data->>'lastDate' >= $1", [todayIST()])
  return rows.map(row => toJobRecord(row).job)
}

export async function listJobs(filter: 'review' | 'open' | 'all'): Promise<JobRecord[]> {
  const where = {
    review: "status = 'pending' OR flag IS NOT NULL",
    open: "status = 'approved'",
    all: 'true',
  }[filter]
  return (await query(`SELECT * FROM jobs WHERE ${where} ORDER BY created_at DESC, id`)).map(toJobRecord)
}

export async function getJobsByGazette(gazetteUrl: string): Promise<JobRecord[]> {
  return (await query('SELECT * FROM jobs WHERE gazette_url = $1', [gazetteUrl])).map(toJobRecord)
}

/** Returns false if the job already existed (e.g. another run saved it first). */
export async function insertJob(job: Job): Promise<boolean> {
  const rows = await query('INSERT INTO jobs (id, data, gazette_url) VALUES ($1, $2::jsonb, $3) ON CONFLICT (id) DO NOTHING RETURNING id',
    [job.id, json(job), job.gazetteUrl ?? null])
  return rows.length > 0
}

/** Saves job data; status and flag change only when given (flag: null clears it). */
export async function updateJob(job: Job, changes: { status?: JobStatus; flag?: string | null } = {}) {
  await query(
    `UPDATE jobs SET data = $2::jsonb, updated_at = now(),
       status = COALESCE($3, status),
       flag = CASE WHEN $4::boolean THEN $5 ELSE flag END
     WHERE id = $1`,
    [job.id, json(job), changes.status ?? null, changes.flag !== undefined, changes.flag ?? null],
  )
}

/** Marks a job as needing admin attention, keeping any earlier reason. */
export async function flagJob(id: string, reason: string) {
  await query(
    `UPDATE jobs SET updated_at = now(), flag = CASE
       WHEN flag IS NULL THEN $2 WHEN position($2 in flag) > 0 THEN flag ELSE flag || '; ' || $2 END
     WHERE id = $1`,
    [id, reason],
  )
}

/** Records an update; returns false if it was already recorded. */
export async function addJobUpdate(jobId: string, kind: JobUpdateKind, title: string, url?: string): Promise<boolean> {
  const rows = await query(
    'INSERT INTO job_updates (job_id, kind, title, url) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id',
    [jobId, kind, title, url ?? null],
  )
  return rows.length > 0
}

export async function getJobUpdates(jobIds: string[]): Promise<JobUpdate[]> {
  if (!jobIds.length) return []
  const rows = await query(
    'SELECT * FROM job_updates WHERE job_id IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY created_at DESC',
    [json(jobIds)],
  )
  return rows.map(row => ({
    id: row.id as number,
    jobId: row.job_id as string,
    kind: row.kind as JobUpdateKind,
    title: row.title as string,
    url: (row.url as string) ?? undefined,
    createdAt: iso(row.created_at),
  }))
}

export async function isUpdateSeen(url: string): Promise<boolean> {
  return (await queryOne('SELECT 1 FROM seen_updates WHERE url = $1', [url])) !== undefined
}

export async function markUpdateSeen(url: string) {
  await query('INSERT INTO seen_updates (url) VALUES ($1) ON CONFLICT DO NOTHING', [url])
}

// ---------- Subscriptions ----------

function toSubscription(row: Row): Subscription {
  return {
    id: row.id as number,
    token: row.token as string,
    channel: row.channel as Subscription['channel'],
    contact: (row.contact as string) ?? undefined,
    push: (row.push as PushSubscriptionData) ?? undefined,
    profile: row.profile as UserProfile,
    verified: row.verified as boolean,
    verifyToken: (row.verify_token as string) ?? null,
    createdAt: iso(row.created_at),
  }
}

export async function insertSubscription(sub: Omit<Subscription, 'id' | 'createdAt'>): Promise<Subscription> {
  const row = await queryOne(
    `INSERT INTO subscriptions (token, channel, contact, push, profile, verified, verify_token)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7) RETURNING *`,
    [sub.token, sub.channel, sub.contact ?? null, sub.push ? json(sub.push) : null, json(sub.profile), sub.verified, sub.verifyToken],
  )
  return toSubscription(row!)
}

export async function getSubscriptionById(id: number) {
  const row = await queryOne('SELECT * FROM subscriptions WHERE id = $1', [id])
  return row ? toSubscription(row) : undefined
}

export async function getSubscriptionByToken(token: string) {
  const row = await queryOne('SELECT * FROM subscriptions WHERE token = $1', [token])
  return row ? toSubscription(row) : undefined
}

export async function getSubscriptionsByEmail(email: string) {
  return (await query("SELECT * FROM subscriptions WHERE channel = 'email' AND contact = $1", [email])).map(toSubscription)
}

export async function getSubscriptionByEndpoint(endpoint: string) {
  const row = await queryOne("SELECT * FROM subscriptions WHERE channel = 'push' AND push->>'endpoint' = $1", [endpoint])
  return row ? toSubscription(row) : undefined
}

export async function getVerifiedSubscriptions() {
  return (await query('SELECT * FROM subscriptions WHERE verified ORDER BY id')).map(toSubscription)
}

export async function verifySubscription(verifyToken: string) {
  const row = await queryOne('UPDATE subscriptions SET verified = true, verify_token = NULL WHERE verify_token = $1 RETURNING *', [verifyToken])
  return row ? toSubscription(row) : undefined
}

export async function updateSubscriptionProfile(id: number, profile: UserProfile) {
  await query('UPDATE subscriptions SET profile = $2::jsonb WHERE id = $1', [id, json(profile)])
}

export async function updateSubscriptionPush(id: number, push: PushSubscriptionData) {
  await query('UPDATE subscriptions SET push = $2::jsonb WHERE id = $1', [id, json(push)])
}

export async function deleteSubscription(id: number) {
  await query('DELETE FROM subscriptions WHERE id = $1', [id])
}

/** Removes email sign-ups that were never confirmed. */
export async function deleteStaleUnverified(hours = 48): Promise<number> {
  return (await query(`DELETE FROM subscriptions WHERE NOT verified AND created_at < now() - make_interval(hours => $1) RETURNING id`, [hours])).length
}

// ---------- Sent alerts ----------

/** All (subscription, job) pairs already alerted, for the given jobs. */
export async function getSentPairs(jobIds: string[]): Promise<Set<string>> {
  if (!jobIds.length) return new Set()
  const rows = await query<{ subscription_id: number; job_id: string }>(
    'SELECT subscription_id, job_id FROM sent WHERE job_id IN (SELECT jsonb_array_elements_text($1::jsonb))', [json(jobIds)])
  return new Set(rows.map(r => `${r.subscription_id}:${r.job_id}`))
}

/**
 * Reserves jobs for an alert before sending. Returns only the jobs this caller reserved, so two
 * runs at the same time can never send the same alert twice.
 */
export async function claimSent(subscriptionId: number, jobIds: string[]): Promise<string[]> {
  if (!jobIds.length) return []
  const rows = await query<{ job_id: string }>(
    `INSERT INTO sent (subscription_id, job_id) SELECT $1, jsonb_array_elements_text($2::jsonb)
     ON CONFLICT DO NOTHING RETURNING job_id`, [subscriptionId, json(jobIds)])
  return rows.map(r => r.job_id)
}

/** Releases a reservation after a failed send, so it is retried later. */
export async function unclaimSent(subscriptionId: number, jobIds: string[]) {
  if (!jobIds.length) return
  await query('DELETE FROM sent WHERE subscription_id = $1 AND job_id IN (SELECT jsonb_array_elements_text($2::jsonb))',
    [subscriptionId, json(jobIds)])
}

// ---------- Locks (one job check at a time across all server instances) ----------

export async function acquireLock(name: string, minutes: number): Promise<boolean> {
  const rows = await query(
    `INSERT INTO locks (name, expires_at) VALUES ($1, now() + make_interval(mins => $2))
     ON CONFLICT (name) DO UPDATE SET expires_at = EXCLUDED.expires_at WHERE locks.expires_at < now()
     RETURNING name`, [name, minutes])
  return rows.length > 0
}

export async function releaseLock(name: string) {
  await query('DELETE FROM locks WHERE name = $1', [name])
}

// ---------- Rate limits (shared by all server instances) ----------

export async function hitRateLimit(key: string, windowMs: number): Promise<{ hits: number; resetAt: Date }> {
  const row = await queryOne<{ hits: number; reset_at: Date }>(
    `INSERT INTO rate_limits (key, hits, reset_at) VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       hits = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.hits + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now() THEN EXCLUDED.reset_at ELSE rate_limits.reset_at END
     RETURNING hits, reset_at`, [key, windowMs / 1000])
  return { hits: row!.hits, resetAt: new Date(row!.reset_at) }
}

export async function changeRateLimit(key: string, delta: number | null) {
  if (delta === null) await query('DELETE FROM rate_limits WHERE key = $1', [key])
  else await query('UPDATE rate_limits SET hits = GREATEST(hits + $2, 0) WHERE key = $1', [key, delta])
}

export async function deleteExpiredRateLimits() {
  await query('DELETE FROM rate_limits WHERE reset_at < now()')
}

// ---------- Job check runs ----------

export async function startRun(): Promise<number> {
  return (await queryOne<{ id: number }>('INSERT INTO runs DEFAULT VALUES RETURNING id'))!.id
}

export async function finishRun(id: number, newJobs: number, errors: string[]) {
  await query('UPDATE runs SET finished_at = now(), ok = $2, new_jobs = $3, errors = $4::jsonb WHERE id = $1',
    [id, errors.length === 0, newJobs, json(errors)])
}

export async function recentRuns(limit = 10) {
  const rows = await query('SELECT * FROM runs ORDER BY id DESC LIMIT $1', [limit])
  return rows.map(row => ({
    startedAt: iso(row.started_at),
    finishedAt: row.finished_at ? iso(row.finished_at) : null,
    ok: row.ok === true,
    newJobs: (row.new_jobs as number) ?? 0,
    errors: (row.errors as string[]) ?? [],
  }))
}

export async function lastSuccessfulRun(): Promise<string | null> {
  const row = await queryOne('SELECT finished_at FROM runs WHERE ok ORDER BY id DESC LIMIT 1')
  return row ? iso(row.finished_at) : null
}

export async function deleteOldRuns(days = 60) {
  await query('DELETE FROM runs WHERE started_at < now() - make_interval(days => $1)', [days])
}

export async function stats() {
  const row = await queryOne<Record<string, number>>(`SELECT
    (SELECT count(*)::int FROM jobs WHERE status = 'pending') AS "pendingJobs",
    (SELECT count(*)::int FROM jobs WHERE flag IS NOT NULL) AS "flaggedJobs",
    (SELECT count(*)::int FROM jobs WHERE status = 'approved' AND data->>'lastDate' >= $1) AS "openJobs",
    (SELECT count(*)::int FROM subscriptions WHERE verified AND channel = 'email') AS "emailSubscribers",
    (SELECT count(*)::int FROM subscriptions WHERE verified AND channel = 'push') AS "pushSubscribers",
    (SELECT count(*)::int FROM subscriptions WHERE NOT verified) AS "unverified"`, [todayIST()])
  return row!
}

/** Every table as JSON, for the admin's manual backup download. */
export async function exportAll() {
  const tables = ['jobs', 'job_updates', 'seen_updates', 'subscriptions', 'sent', 'runs']
  const out: Record<string, Row[]> = {}
  for (const t of tables) out[t] = await query(`SELECT * FROM ${t}`)
  return { exportedAt: new Date().toISOString(), tables: out }
}
