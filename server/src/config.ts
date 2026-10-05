const env = process.env

export const isProduction = env.NODE_ENV === 'production'

export const config = {
  port: Number(env.PORT ?? 4000),
  // Local dev listens on localhost only (corporate laptop firewall); hosting needs 0.0.0.0
  host: env.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1'),
  appUrl: (env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  dbPath: env.DB_PATH ?? 'psc-helper.db',
  backupDir: env.BACKUP_DIR ?? 'backups',
  clientDist: env.CLIENT_DIST,
  trustProxy: Number(env.TRUST_PROXY ?? (isProduction ? 1 : 0)),

  adminPassword: env.ADMIN_PASSWORD ?? '',
  adminEmail: env.ADMIN_EMAIL ?? '',

  smtp: {
    host: env.SMTP_HOST ?? '',
    port: Number(env.SMTP_PORT ?? 465),
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
