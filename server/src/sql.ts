// Minimal Postgres access: Supabase in production, embedded PGlite for local development and tests.
// Both use $1, $2... placeholders and return rows as plain objects.
import { config } from './config.js'

type Row = Record<string, unknown>

interface Driver {
  query(text: string, params: unknown[]): Promise<Row[]>
  exec(text: string): Promise<void>
  close(): Promise<void>
}

async function connect(): Promise<Driver> {
  if (config.databaseUrl) {
    const { default: postgres } = await import('postgres')
    // prepare: false is required by Supabase's transaction pooler; max 1 suits serverless
    const sql = postgres(config.databaseUrl, { prepare: false, max: 1, idle_timeout: 20, onnotice: () => {} })
    return {
      query: async (text, params) => [...await sql.unsafe(text, params as never[])] as Row[],
      exec: async text => void await sql.unsafe(text),
      close: () => sql.end(),
    }
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const pg = new PGlite(config.pgliteDir)
  return {
    query: async (text, params) => (await pg.query<Row>(text, params)).rows,
    exec: async text => void await pg.exec(text),
    close: () => pg.close(),
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS jobs (
    id text PRIMARY KEY,
    status text NOT NULL DEFAULT 'pending',
    flag text,
    data jsonb NOT NULL,
    gazette_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS job_updates (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    kind text NOT NULL,
    title text NOT NULL,
    url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (job_id, kind, title)
  );
  CREATE TABLE IF NOT EXISTS seen_updates (url text PRIMARY KEY);

  CREATE TABLE IF NOT EXISTS subscriptions (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token text NOT NULL UNIQUE,
    channel text NOT NULL,
    contact text,
    push jsonb,
    profile jsonb NOT NULL,
    verified boolean NOT NULL DEFAULT false,
    verify_token text UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS subscriptions_contact ON subscriptions (contact);
  CREATE INDEX IF NOT EXISTS subscriptions_endpoint ON subscriptions ((push->>'endpoint'));

  CREATE TABLE IF NOT EXISTS sent (
    subscription_id integer NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    job_id text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    sent_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subscription_id, job_id)
  );

  CREATE TABLE IF NOT EXISTS runs (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    ok boolean,
    new_jobs integer,
    errors jsonb
  );
  CREATE TABLE IF NOT EXISTS locks (name text PRIMARY KEY, expires_at timestamptz NOT NULL);
  CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, hits integer NOT NULL, reset_at timestamptz NOT NULL);

  -- Supabase exposes the public schema through its REST API. With RLS on and no policies,
  -- that API can read nothing; this server connects as the owner and is not affected.
  ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE job_updates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE seen_updates ENABLE ROW LEVEL SECURITY;
  ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sent ENABLE ROW LEVEL SECURITY;
  ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE locks ENABLE ROW LEVEL SECURITY;
  ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
`

// One connection and one schema check per server instance (per warm serverless function)
let ready: Promise<Driver> | undefined

function driver(): Promise<Driver> {
  ready ??= connect().then(async d => {
    await d.exec(SCHEMA)
    return d
  }).catch(err => {
    ready = undefined // retry on the next request
    throw err
  })
  return ready
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await driver()).query(text, params) as Promise<T[]>
}

export async function queryOne<T = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(text, params))[0]
}

export async function closeDb() {
  if (ready) await (await ready).close()
  ready = undefined
}
