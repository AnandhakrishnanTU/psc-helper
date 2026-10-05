import { rateLimit, type Options, type Store } from 'express-rate-limit'
import { changeRateLimit, hitRateLimit } from './db.js'

// Counts are kept in the database, because serverless instances do not share memory
class DbStore implements Store {
  localKeys = false
  windowMs = 60_000
  constructor(readonly prefix: string) {}

  init(options: Options) {
    this.windowMs = options.windowMs
  }

  async increment(key: string) {
    const { hits, resetAt } = await hitRateLimit(this.prefix + key, this.windowMs)
    return { totalHits: hits, resetTime: resetAt }
  }

  async decrement(key: string) {
    await changeRateLimit(this.prefix + key, -1)
  }

  async resetKey(key: string) {
    await changeRateLimit(this.prefix + key, null)
  }
}

/** A rate limiter with its own counter, shared by all server instances. */
export function limiter(name: string, windowMs: number, limit: number, extra: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new DbStore(`${name}:`),
    // If the database is briefly unreachable, let the request through instead of failing it
    passOnStoreError: true,
    message: { error: 'Too many requests. Please try again later.' },
    ...extra,
  })
}
