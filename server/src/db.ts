import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'
import { todayIST } from './dates.js'
import type { Job, JobRecord, JobStatus, JobUpdate, JobUpdateKind, PushSubscriptionData, Subscription, UserProfile } from './types.js'

fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true })
export const db = new DatabaseSync(config.dbPath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

const SCHEMA_VERSION = 1
const version = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)
if (version < SCHEMA_VERSION) {
  // Version 0 was the prototype schema with local test data only
  db.exec(`
    DROP TABLE IF EXISTS jobs;
    DROP TABLE IF EXISTS subscriptions;

    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      flag TEXT,
      data TEXT NOT NULL,
      gazette_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE job_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (job_id, kind, title)
    );
    CREATE TABLE seen_updates (url TEXT PRIMARY KEY);

    CREATE TABLE subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      channel TEXT NOT NULL,
      contact TEXT,
      push TEXT,
      profile TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      verify_token TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX subscriptions_contact ON subscriptions(contact);

    CREATE TABLE sent (
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (subscription_id, job_id)
    );

    CREATE TABLE runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      ok INTEGER,
      new_jobs INTEGER,
      errors TEXT
    );
    PRAGMA user_version = ${SCHEMA_VERSION};
  `)
}

type Row = Record<string, unknown>

// ---------- Jobs ----------

function toJobRecord(row: Row): JobRecord {
  return {
    job: JSON.parse(row.data as string),
    status: row.status as JobStatus,
    flag: (row.flag as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function getJob(id: string): JobRecord | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)
  return row ? toJobRecord(row) : undefined
}

/** Approved jobs whose last date has not passed. */
export function getOpenJobs(): Job[] {
  return db.prepare("SELECT * FROM jobs WHERE status = 'approved'").all()
    .map(row => toJobRecord(row).job)
    .filter(job => job.lastDate >= todayIST())
}

export function listJobs(filter: 'review' | 'open' | 'all'): JobRecord[] {
  const where = {
    review: "status = 'pending' OR flag IS NOT NULL",
    open: "status = 'approved'",
    all: '1 = 1',
  }[filter]
  return db.prepare(`SELECT * FROM jobs WHERE ${where} ORDER BY created_at DESC, id`).all().map(toJobRecord)
}

export function getJobsByGazette(gazetteUrl: string): JobRecord[] {
  return db.prepare('SELECT * FROM jobs WHERE gazette_url = ?').all(gazetteUrl).map(toJobRecord)
}

export function insertJob(job: Job) {
  db.prepare('INSERT INTO jobs (id, data, gazette_url) VALUES (?, ?, ?)').run(job.id, JSON.stringify(job), job.gazetteUrl ?? null)
}

export function updateJob(job: Job, changes: { status?: JobStatus; flag?: string | null } = {}) {
  const current = getJob(job.id)
  if (!current) throw new Error(`Job ${job.id} not found`)
  db.prepare("UPDATE jobs SET data = ?, status = ?, flag = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(job),
    changes.status ?? current.status,
    changes.flag === undefined ? current.flag : changes.flag,
    job.id,
  )
}

/** Marks a job as needing admin attention, keeping any earlier reason. */
export function flagJob(id: string, reason: string) {
  const current = getJob(id)
  if (!current) return
  const flag = current.flag && !current.flag.includes(reason) ? `${current.flag}; ${reason}` : reason
  db.prepare("UPDATE jobs SET flag = ?, updated_at = datetime('now') WHERE id = ?").run(flag, id)
}

/** Records an update; returns false if it was already recorded. */
export function addJobUpdate(jobId: string, kind: JobUpdateKind, title: string, url?: string): boolean {
  return db.prepare('INSERT OR IGNORE INTO job_updates (job_id, kind, title, url) VALUES (?, ?, ?, ?)')
    .run(jobId, kind, title, url ?? null).changes > 0
}

export function getJobUpdates(jobIds: string[]): JobUpdate[] {
  if (!jobIds.length) return []
  return db.prepare(`SELECT * FROM job_updates WHERE job_id IN (${jobIds.map(() => '?').join(',')}) ORDER BY created_at DESC`)
    .all(...jobIds)
    .map(row => ({
      id: row.id as number,
      jobId: row.job_id as string,
      kind: row.kind as JobUpdateKind,
      title: row.title as string,
      url: (row.url as string) ?? undefined,
      createdAt: row.created_at as string,
    }))
}

export function isUpdateSeen(url: string): boolean {
  return db.prepare('SELECT 1 FROM seen_updates WHERE url = ?').get(url) !== undefined
}

export function markUpdateSeen(url: string) {
  db.prepare('INSERT OR IGNORE INTO seen_updates (url) VALUES (?)').run(url)
}

// ---------- Subscriptions ----------

function toSubscription(row: Row): Subscription {
  return {
    id: row.id as number,
    token: row.token as string,
    channel: row.channel as Subscription['channel'],
    contact: (row.contact as string) ?? undefined,
    push: row.push ? JSON.parse(row.push as string) : undefined,
    profile: JSON.parse(row.profile as string),
    verified: row.verified === 1,
    verifyToken: (row.verify_token as string) ?? null,
    createdAt: row.created_at as string,
  }
}

export function insertSubscription(sub: Omit<Subscription, 'id' | 'createdAt'>): Subscription {
  const result = db.prepare(
    'INSERT INTO subscriptions (token, channel, contact, push, profile, verified, verify_token) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(sub.token, sub.channel, sub.contact ?? null, sub.push ? JSON.stringify(sub.push) : null,
    JSON.stringify(sub.profile), sub.verified ? 1 : 0, sub.verifyToken)
  return getSubscriptionById(Number(result.lastInsertRowid))!
}

export function getSubscriptionById(id: number): Subscription | undefined {
  const row = db.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id)
  return row ? toSubscription(row) : undefined
}

export function getSubscriptionByToken(token: string): Subscription | undefined {
  const row = db.prepare('SELECT * FROM subscriptions WHERE token = ?').get(token)
  return row ? toSubscription(row) : undefined
}

export function getSubscriptionsByEmail(email: string): Subscription[] {
  return db.prepare("SELECT * FROM subscriptions WHERE channel = 'email' AND contact = ?").all(email).map(toSubscription)
}

export function getSubscriptionByEndpoint(endpoint: string): Subscription | undefined {
  const row = db.prepare("SELECT * FROM subscriptions WHERE channel = 'push' AND json_extract(push, '$.endpoint') = ?").get(endpoint)
  return row ? toSubscription(row) : undefined
}

export function getVerifiedSubscriptions(): Subscription[] {
  return db.prepare('SELECT * FROM subscriptions WHERE verified = 1').all().map(toSubscription)
}

export function verifySubscription(verifyToken: string): Subscription | undefined {
  const row = db.prepare('SELECT id FROM subscriptions WHERE verify_token = ?').get(verifyToken)
  if (!row) return undefined
  db.prepare('UPDATE subscriptions SET verified = 1, verify_token = NULL WHERE id = ?').run(row.id as number)
  return getSubscriptionById(row.id as number)
}

export function updateSubscriptionProfile(id: number, profile: UserProfile) {
  db.prepare('UPDATE subscriptions SET profile = ? WHERE id = ?').run(JSON.stringify(profile), id)
}

export function updateSubscriptionPush(id: number, push: PushSubscriptionData) {
  db.prepare('UPDATE subscriptions SET push = ? WHERE id = ?').run(JSON.stringify(push), id)
}

export function deleteSubscription(id: number) {
  db.prepare('DELETE FROM subscriptions WHERE id = ?').run(id)
}

/** Removes email sign-ups that were never confirmed. */
export function deleteStaleUnverified(hours = 48): number {
  return Number(db.prepare(`DELETE FROM subscriptions WHERE verified = 0 AND created_at < datetime('now', '-${hours} hours')`).run().changes)
}

// ---------- Sent alerts ----------

export function wasSent(subscriptionId: number, jobId: string): boolean {
  return db.prepare('SELECT 1 FROM sent WHERE subscription_id = ? AND job_id = ?').get(subscriptionId, jobId) !== undefined
}

export function markSent(subscriptionId: number, jobIds: string[]) {
  const insert = db.prepare('INSERT OR IGNORE INTO sent (subscription_id, job_id) VALUES (?, ?)')
  for (const id of jobIds) insert.run(subscriptionId, id)
}

// ---------- Scrape runs ----------

export function startRun(): number {
  return Number(db.prepare('INSERT INTO runs (started_at) VALUES (?)').run(new Date().toISOString()).lastInsertRowid)
}

export function finishRun(id: number, newJobs: number, errors: string[]) {
  db.prepare('UPDATE runs SET finished_at = ?, ok = ?, new_jobs = ?, errors = ? WHERE id = ?')
    .run(new Date().toISOString(), errors.length ? 0 : 1, newJobs, JSON.stringify(errors), id)
}

export function recentRuns(limit = 10) {
  return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').all(limit).map(row => ({
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string) ?? null,
    ok: row.ok === 1,
    newJobs: (row.new_jobs as number) ?? 0,
    errors: row.errors ? (JSON.parse(row.errors as string) as string[]) : [],
  }))
}

export function lastSuccessfulRun(): string | null {
  const row = db.prepare('SELECT finished_at FROM runs WHERE ok = 1 ORDER BY id DESC LIMIT 1').get()
  return (row?.finished_at as string) ?? null
}

export function stats() {
  const count = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n)
  return {
    pendingJobs: count("SELECT COUNT(*) n FROM jobs WHERE status = 'pending'"),
    flaggedJobs: count('SELECT COUNT(*) n FROM jobs WHERE flag IS NOT NULL'),
    openJobs: getOpenJobs().length,
    emailSubscribers: count("SELECT COUNT(*) n FROM subscriptions WHERE verified = 1 AND channel = 'email'"),
    pushSubscribers: count("SELECT COUNT(*) n FROM subscriptions WHERE verified = 1 AND channel = 'push'"),
    unverified: count('SELECT COUNT(*) n FROM subscriptions WHERE verified = 0'),
  }
}
