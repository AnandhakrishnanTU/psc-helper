import { DatabaseSync } from 'node:sqlite'
import type { Job, Subscription } from './types.js'

const db = new DatabaseSync('psc-helper.db')

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, data TEXT NOT NULL);
  DELETE FROM jobs WHERE id LIKE 'sample-%';
`)

export function getActiveJobs(): Job[] {
  const today = new Date().toISOString().slice(0, 10)
  return db.prepare('SELECT data FROM jobs').all()
    .map(row => JSON.parse(row.data as string) as Job)
    .filter(job => job.lastDate >= today)
}

export function jobExists(id: string): boolean {
  return db.prepare('SELECT 1 FROM jobs WHERE id = ?').get(id) !== undefined
}

/** Inserts jobs not seen before and returns only the new ones. */
export function saveNewJobs(jobs: Job[]): Job[] {
  const insert = db.prepare('INSERT OR IGNORE INTO jobs (id, data) VALUES (?, ?)')
  return jobs.filter(job => insert.run(job.id, JSON.stringify(job)).changes > 0)
}

export function addSubscription(sub: Subscription) {
  db.prepare('INSERT INTO subscriptions (data) VALUES (?)').run(JSON.stringify(sub))
}

export function getSubscriptions(): Subscription[] {
  return db.prepare('SELECT id, data FROM subscriptions').all()
    .map(row => ({ ...JSON.parse(row.data as string), id: row.id as number }))
}
