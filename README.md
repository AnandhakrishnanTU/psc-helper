# PSC Helper

Find open Kerala PSC jobs that match your qualification, and get alerts when new ones are published.

- `client/`: React PWA (job search, alerts, manage/unsubscribe, privacy, admin)
- `server/`: Node + Express + SQLite (PSC scraper, eligibility matching, email and push alerts)

## How it works

1. Every 3 hours the server reads keralapsc.gov.in: the notifications page, each gazette's PDFs, and the Addendum/Erratum page.
2. New jobs are saved as **pending**. The admin gets an email, checks each job at `/admin` against the PDF, and approves it.
3. Only approved jobs are shown to users. About 2 minutes after approval, matching subscribers are alerted (each job is sent once).
4. Last-date changes, replaced PDFs, removed jobs and errata/addenda/cancellations are attached to the job and flagged for the admin.

## Local development

Requires Node 24+.

```
cd server && npm install && cp .env.example .env   # fill ADMIN_PASSWORD, VAPID keys
npm run dev                                         # API on http://localhost:4000
cd client && npm install && npm run dev             # app on http://localhost:5173
```

Useful commands (in `server/`):

| Command | What it does |
|---|---|
| `npm run scrape` | Run one PSC check now |
| `npm test` | Extractor and matching regression tests |
| `npm run audit` | Run the extractor over every notification on the PSC site and report misreads (`.cache/audit.json`) |

In `client/`: `npm run icons` regenerates app icons from `public/logo.svg`.

## Deploying (Render)

1. Push this repo to GitHub.
2. In Render: **New > Blueprint**, pick the repo. `render.yaml` creates a Starter web service with a 1 GB disk.
3. Fill in the secret env vars in the dashboard (see `server/.env.example`): `APP_URL`, `ADMIN_EMAIL`, VAPID keys, SMTP settings, `VITE_CONTACT_EMAIL`. Copy the generated `ADMIN_PASSWORD`.
4. After the first deploy, open `/admin`, log in and approve the jobs found.

Other hosts work the same way: `npm run install:all && npm run build`, then `npm start` with `NODE_ENV=production`, a persistent `DB_PATH`, and HTTPS (needed for the PWA and push).

## Operations

- **Backups:** daily at 02:30 IST into `BACKUP_DIR` (14 kept). Also use **Download database backup** in `/admin` regularly and keep a copy off the server.
- **Health:** `GET /api/health` returns the last successful PSC check, for an uptime monitor.
- **Alerts to the admin:** new jobs to review, flagged changes, scrape errors (e.g. PSC changed their page layout), and no successful check for 12 hours.
- **Logs:** JSON lines on stdout in production.
