const env = process.env

export const isProduction = env.NODE_ENV === 'production'

export const config = {
  port: Number(env.PORT ?? 4000),
  // Local server listens on localhost only (corporate laptop firewall)
  host: env.HOST ?? '127.0.0.1',
  appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),

  // Supabase Postgres (transaction pooler URL). Empty = local embedded Postgres in PGLITE_DIR.
  databaseUrl: env.DATABASE_URL ?? '',
  pgliteDir: env.PGLITE_DIR ?? '.pgdata',

  // Shared secret for /api/cron/* (Supabase pg_cron and Vercel cron send it as a Bearer token)
  cronSecret: env.CRON_SECRET ?? '',
  // Serverless functions are stopped after a time limit; long work stops early and resumes next run
  timeBudgetMs: Number(env.TIME_BUDGET_MS ?? 200_000),
  trustProxy: Number(env.TRUST_PROXY ?? (isProduction ? 1 : 0)),

  adminPassword: env.ADMIN_PASSWORD ?? '',
  adminEmail: env.ADMIN_EMAIL ?? '',

  smtp: {
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 587),
    user: env.SMTP_USER ?? '',
    pass: env.SMTP_PASS ?? '',
    from: env.EMAIL_FROM ?? env.SMTP_USER ?? '',
  },

  vapid: {
    publicKey: env.VAPID_PUBLIC_KEY ?? '',
    privateKey: env.VAPID_PRIVATE_KEY ?? '',
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  },
}

export const adminEnabled = config.adminPassword.length >= 12

/** Returns a function telling whether the time budget is used up. */
export function deadline(budgetMs = config.timeBudgetMs) {
  const end = Date.now() + budgetMs
  return () => Date.now() > end
}
