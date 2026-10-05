# GovJoli

Find open Kerala PSC jobs you can apply for, and get alerts when new ones are published. A free tool by [Codemure](https://codemure.com), live at https://govjoli.codemure.com.

- `client/`: React PWA (job search, alerts, manage/unsubscribe, privacy, admin)
- `server/`: Express API (PSC scraper, eligibility matching, email and push alerts)
- `api/index.js`: the API as a Vercel serverless function
- `supabase/cron.sql`: schedules the PSC check every 3 hours

Runs entirely on free tiers: Vercel (app + API), Supabase (Postgres + pg_cron), Brevo (email), Web Push.

## How it works

1. Every 3 hours Supabase pg_cron calls `/api/cron/check`. The server reads keralapsc.gov.in (notifications, each gazette's PDFs, the Addendum/Erratum page).
2. New jobs are saved as **pending** and the admin gets an email. The admin checks each job at `/admin` against the PDF and approves it.
3. Only approved jobs are shown. Alerts go out when the admin presses **Send alerts now**, or with the next check. Each job is sent to each person once.
4. Date changes, replaced PDFs, removed jobs and errata/addenda/cancellations are attached to the job and flagged for the admin.
5. A daily Vercel cron (`/api/cron/daily`) cleans up, and runs a check if the 3-hourly one seems to have stopped.

Work that doesn't fit in one serverless run (time budget `TIME_BUDGET_MS`) stops early and continues in the next run.

## Local development

Requires Node 22+. No database to install: locally the server uses PGlite (Postgres in Node), stored in `server/.pgdata`.

```
cd server && npm install && cp .env.example .env   # set ADMIN_PASSWORD, CRON_SECRET, VAPID keys
npm run dev                                         # API on http://localhost:4000, checks PSC on start
cd client && npm install && npm run dev             # app on http://localhost:5173
```

| Command (in `server/`) | What it does |
|---|---|
| `npm run scrape` | Run one PSC check now |
| `npm test` | Extractor and matching regression tests |
| `npm run audit` | Run the extractor over every notification on the PSC site and report misreads (`.cache/audit.json`) |

`npm run icons` in `client/` regenerates the app icons from `public/logo.svg`.

## Deploying

### 1. Supabase (database)
1. Create a project. Region: **Mumbai (ap-south-1)**. Save the database password.
2. **Connect > Transaction pooler**: copy the URI (port 6543) and put the password in it. This is `DATABASE_URL`.

Tables are created automatically on the first request.

### 2. Brevo (email)
1. Sign up. Under **Senders, Domains & Dedicated IPs > Domains**, add `codemure.com` and add the DNS records it shows (DKIM, DMARC, and Brevo code).
   - **If codemure.com already has an SPF record** (a TXT record starting with `v=spf1`), add `include:spf.brevo.com` to that record instead of creating a second one. Two SPF records break all email for the domain.
2. **SMTP & API > SMTP**: copy the login and create an SMTP key. These are `SMTP_USER` and `SMTP_PASS`.

### 3. Keys
- `npx web-push generate-vapid-keys` gives `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`. Generate new ones for production.
- `CRON_SECRET` and `ADMIN_PASSWORD`: long random strings, e.g. `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

### 4. Vercel
1. Push this repo to GitHub, then **Add New > Project** and import it. Keep the root directory as the repo root. The rest of the settings come from `vercel.json`.
2. Add environment variables (Production):

   | Name | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `APP_URL` | `https://govjoli.codemure.com` |
   | `DATABASE_URL` | from step 1 |
   | `ADMIN_PASSWORD`, `ADMIN_EMAIL` | yours |
   | `CRON_SECRET` | from step 3 |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | from step 3 |
   | `VAPID_SUBJECT` | `mailto:your@email` |
   | `SMTP_HOST`, `SMTP_PORT` | `smtp-relay.brevo.com`, `587` |
   | `SMTP_USER`, `SMTP_PASS` | from step 2 |
   | `EMAIL_FROM` | `GovJoli <alerts@codemure.com>` |
   | `VITE_CONTACT_EMAIL` | contact email shown on the privacy page |

3. Deploy.
4. **Settings > Domains**: add `govjoli.codemure.com`. In your DNS, add the CNAME record Vercel shows (`govjoli` → `cname.vercel-dns.com`). Your main site is not affected.

### 5. Schedule the check
Open `supabase/cron.sql`, replace `YOUR_CRON_SECRET`, and run it in **Supabase > SQL Editor**.

### 6. First run
Open `https://govjoli.codemure.com/admin`, log in, press **Check PSC now**, review and approve the jobs, then **Send alerts now**.

## Operations

- **Review:** when you get a "[GovJoli] N job(s) waiting for review" email, approve them in `/admin`, then press **Send alerts now**.
- **Backups:** Supabase free has no automatic backups. Press **Download backup** in `/admin` every week and keep the file somewhere private (it contains user emails).
- **Supabase pausing:** free projects pause after 7 days without activity. The 3-hourly check keeps it active. If checks stop, you get an email from the daily cron.
- **Health:** `GET /api/health` returns the last successful check (useful for an uptime monitor).
- **Logs:** Vercel > Project > Logs. Cron history: see the queries at the end of `supabase/cron.sql`.
