import { isProduction } from './config.js'

type Level = 'info' | 'warn' | 'error'

function write(level: Level, msg: string, extra?: unknown) {
  const detail = extra instanceof Error ? { error: extra.message, stack: extra.stack } : extra
  if (isProduction) {
    // One JSON line per entry, easy to search in hosting logs
    console[level](JSON.stringify({ time: new Date().toISOString(), level, msg, ...(detail ? { detail } : {}) }))
  } else {
    console[level](`[${level}] ${msg}`, detail ?? '')
  }
}

export const log = {
  info: (msg: string, extra?: unknown) => write('info', msg, extra),
  warn: (msg: string, extra?: unknown) => write('warn', msg, extra),
  error: (msg: string, extra?: unknown) => write('error', msg, extra),
}
