import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { db } from './db.js'
import { todayIST } from './dates.js'
import { log } from './log.js'

const KEEP = 14

/** Writes a consistent copy of the database (safe while the app is running). */
export function backupTo(file: string) {
  fs.rmSync(file, { force: true })
  db.prepare('VACUUM INTO ?').run(file)
}

/** Daily backup into BACKUP_DIR, keeping the last 14 days. */
export function dailyBackup() {
  try {
    fs.mkdirSync(config.backupDir, { recursive: true })
    backupTo(path.join(config.backupDir, `psc-helper-${todayIST()}.db`))
    const old = fs.readdirSync(config.backupDir).filter(f => /^psc-helper-.*\.db$/.test(f)).sort().slice(0, -KEEP)
    for (const f of old) fs.rmSync(path.join(config.backupDir, f))
    log.info('Database backup written')
  } catch (err) {
    log.error('Database backup failed', err)
  }
}
