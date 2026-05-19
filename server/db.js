/**
 * Postgres data layer.
 *
 * Connects via DATABASE_URL (e.g. postgresql://navi:pass@postgres:5432/navi).
 * Schema is created on import (top-level await) so the server/agent only start
 * once the tables exist. All exported helpers are async.
 */
import pg from 'pg';

const { Pool } = pg;

// Parse BIGINT (int8, OID 20) as JS Number instead of string — matches the old
// SQLite INTEGER behaviour consumers rely on. Safe: ids + epoch values < 2^53.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set — point it at the Postgres instance');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Set DATABASE_SSL=1 for managed/external Postgres that requires TLS.
  ssl: process.env.DATABASE_SSL === '1' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => console.error('[db] idle client error:', err.message));

// Query helpers — `one` returns the first row (or undefined), `all` returns all.
const run = (text, params) => pool.query(text, params);
const one = async (text, params) => (await pool.query(text, params)).rows[0];
const all = async (text, params) => (await pool.query(text, params)).rows;

// ── Schema ────────────────────────────────────────────────────────────────────
// Fresh-start schema. SQLite migrations (addColumn) are folded in directly.
// INTEGER kept for boolean-ish flags so consumer code (`!!u.agent_enabled`,
// `is_lead ? 1 : 0`) needs no change. Timestamps are unix-epoch BIGINT.
const initSchema = () => run(`
  CREATE TABLE IF NOT EXISTS users (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email                  TEXT    UNIQUE NOT NULL,
    name                   TEXT    NOT NULL DEFAULT '',
    plan                   TEXT    NOT NULL DEFAULT 'free',
    api_key                TEXT    UNIQUE NOT NULL,
    dashboard_token        TEXT    UNIQUE NOT NULL,
    stripe_customer_id     TEXT,
    stripe_subscription_id TEXT,
    site_url               TEXT    DEFAULT '',
    vinyl_color            TEXT    DEFAULT 'midnight',
    agent_enabled          INTEGER DEFAULT 1,
    minute_used            INTEGER DEFAULT 0,
    created_at             BIGINT  DEFAULT extract(epoch from now())::bigint,
    last_seen              BIGINT  DEFAULT extract(epoch from now())::bigint,
    billing_cycle_start    BIGINT,
    session_count          INTEGER DEFAULT 0,
    bonus_sessions         INTEGER DEFAULT 0,
    voice                  TEXT    DEFAULT 'onyx',
    persona                TEXT    DEFAULT '',
    lang                   TEXT    DEFAULT 'en',
    lang_auto              INTEGER DEFAULT 0,
    extra_context          TEXT    DEFAULT '',
    widget_seen_at         BIGINT,
    last_quota_reset       BIGINT,
    kb_status              TEXT    DEFAULT 'none',
    kb_built_at            BIGINT,
    kb_pages               INTEGER DEFAULT 0,
    proactive_delay        INTEGER DEFAULT 120,
    auto_palette           INTEGER DEFAULT 0,
    voice_seconds_used     BIGINT  DEFAULT 0,
    tts_chars_used         BIGINT  DEFAULT 0,
    llm_tokens_used        BIGINT  DEFAULT 0,
    kb_pages_used          INTEGER DEFAULT 0
  );

  -- Idempotent column adds for upgrades from earlier schemas.
  ALTER TABLE users ADD COLUMN IF NOT EXISTS voice_seconds_used BIGINT DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS tts_chars_used     BIGINT DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_tokens_used    BIGINT DEFAULT 0;
  ALTER TABLE users ADD COLUMN IF NOT EXISTS kb_pages_used      INTEGER DEFAULT 0;

  CREATE TABLE IF NOT EXISTS conversations (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id),
    page_url   TEXT,
    visitor_id TEXT,
    message    TEXT NOT NULL,
    reply      TEXT NOT NULL,
    is_lead    INTEGER DEFAULT 0,
    created_at BIGINT  DEFAULT extract(epoch from now())::bigint
  );

  CREATE TABLE IF NOT EXISTS leads (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id),
    visitor_id TEXT,
    name       TEXT,
    email      TEXT,
    page_url   TEXT,
    created_at BIGINT  DEFAULT extract(epoch from now())::bigint
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES users(id),
    visitor_id     TEXT,
    room_name      TEXT UNIQUE,
    lang           TEXT DEFAULT 'en',
    page_url       TEXT,
    status         TEXT NOT NULL DEFAULT 'open',
    started_at     BIGINT  DEFAULT extract(epoch from now())::bigint,
    ended_at       BIGINT,
    duration_sec   INTEGER DEFAULT 0,
    cost_eur_cents INTEGER DEFAULT 0,
    counted        INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_room ON sessions(room_name);

  CREATE TABLE IF NOT EXISTS visitors (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id),
    visitor_id  TEXT NOT NULL,
    country     TEXT,
    device      TEXT,
    browser     TEXT,
    first_seen  BIGINT  DEFAULT extract(epoch from now())::bigint,
    last_seen   BIGINT  DEFAULT extract(epoch from now())::bigint,
    visit_count INTEGER DEFAULT 1,
    UNIQUE(user_id, visitor_id)
  );
  CREATE INDEX IF NOT EXISTS idx_visitors_user ON visitors(user_id);

  CREATE TABLE IF NOT EXISTS kb_chunks (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id),
    url        TEXT,
    title      TEXT,
    kind       TEXT DEFAULT 'content',
    content    TEXT NOT NULL,
    embedding  TEXT,
    created_at BIGINT  DEFAULT extract(epoch from now())::bigint
  );
  CREATE INDEX IF NOT EXISTS idx_kb_user ON kb_chunks(user_id);

  CREATE TABLE IF NOT EXISTS usage_events (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id        BIGINT REFERENCES users(id),
    provider       TEXT NOT NULL,
    metric         TEXT NOT NULL,
    amount         NUMERIC NOT NULL DEFAULT 0,
    cost_eur_cents INTEGER DEFAULT 0,
    meta           JSONB DEFAULT '{}'::jsonb,
    created_at     BIGINT DEFAULT extract(epoch from now())::bigint
  );
  CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_usage_events_metric_created ON usage_events(metric, created_at);

  CREATE TABLE IF NOT EXISTS provider_errors (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id),
    provider    TEXT NOT NULL,
    route       TEXT,
    status      INTEGER,
    error       TEXT,
    meta        JSONB DEFAULT '{}'::jsonb,
    created_at  BIGINT DEFAULT extract(epoch from now())::bigint
  );
  CREATE INDEX IF NOT EXISTS idx_provider_errors_created ON provider_errors(created_at);
  CREATE INDEX IF NOT EXISTS idx_provider_errors_provider ON provider_errors(provider, created_at);

  CREATE TABLE IF NOT EXISTS health_checks (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target      TEXT NOT NULL,
    ok          INTEGER NOT NULL DEFAULT 0,
    latency_ms  INTEGER,
    error       TEXT,
    created_at  BIGINT DEFAULT extract(epoch from now())::bigint
  );
  CREATE INDEX IF NOT EXISTS idx_health_target_created ON health_checks(target, created_at);

  CREATE TABLE IF NOT EXISTS admin_alerts (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind        TEXT NOT NULL,
    user_id     BIGINT REFERENCES users(id),
    payload     JSONB DEFAULT '{}'::jsonb,
    sent        INTEGER DEFAULT 0,
    created_at  BIGINT DEFAULT extract(epoch from now())::bigint,
    UNIQUE(kind, user_id, created_at)
  );
`);

// web + agent boot together → concurrent `CREATE TABLE IF NOT EXISTS` can race
// on the system catalog. Retry once; by then the tables exist.
try {
  await initSchema();
} catch (err) {
  console.warn('[db] schema init failed, retrying:', err.message);
  await new Promise(r => setTimeout(r, 1000));
  await initSchema();
}

// ── Plan quota config ─────────────────────────────────────────────────────────
// Source: "prezzi navi.docx" — final approved pricing (Strada A).
export const PLAN_QUOTA = { free: 50, starter: 200, business: 600, agency: 1500 };

// Avg cost per session in EUR cents (docx §3: €0.081 → 8 cents).
export const SESSION_COST_CENTS = 8;

export const planQuota = (plan) => PLAN_QUOTA[plan] ?? PLAN_QUOTA.free;

// Per-plan caps for the non-session metrics. Derived from typical session
// shape (~4 min voice / ~600 TTS chars / ~4k LLM tokens) × plan sessions, with
// headroom. These protect margin against pathological abuse (one customer
// burning more LLM/TTS than their plan revenue can cover).
//
// Units:
//   voice_seconds_used  — seconds of LiveKit voice session time
//   tts_chars_used      — characters synthesized via /api/tts proxy
//   llm_tokens_used     — total tokens charged by Groq on /api/chat
//   kb_pages_used       — pages crawled into the knowledge base
export const PLAN_LIMITS = {
  free:     { voice_seconds:  3600,  tts_chars:    50_000, llm_tokens:    200_000, kb_pages:  30 },
  starter:  { voice_seconds: 18000,  tts_chars:   300_000, llm_tokens:  1_200_000, kb_pages: 100 },
  business: { voice_seconds: 60000,  tts_chars: 1_000_000, llm_tokens:  4_000_000, kb_pages: 300 },
  agency:   { voice_seconds: 150000, tts_chars: 2_500_000, llm_tokens: 10_000_000, kb_pages: 800 },
};

export const planLimits = (plan) => PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

// Pure — derive remaining headroom across every metric for a loaded user row.
export const getUsageLimits = (user) => {
  const caps = planLimits(user.plan);
  const bonus = user.bonus_sessions ?? 0;
  const mk = (used, limit) => {
    const u = Number(used) || 0;
    const remaining = Math.max(0, limit - u);
    return { used: u, limit, remaining, pct: limit > 0 ? u / limit : 0, exhausted: u >= limit };
  };
  return {
    sessions:      { ...mk(user.session_count ?? 0, planQuota(user.plan)), bonus,
                     remaining: Math.max(0, planQuota(user.plan) - (user.session_count ?? 0)) + bonus,
                     exhausted: (Math.max(0, planQuota(user.plan) - (user.session_count ?? 0)) + bonus) <= 0 },
    voice_seconds: mk(user.voice_seconds_used,  caps.voice_seconds),
    tts_chars:     mk(user.tts_chars_used,      caps.tts_chars),
    llm_tokens:    mk(user.llm_tokens_used,     caps.llm_tokens),
    kb_pages:      mk(user.kb_pages_used,       caps.kb_pages),
  };
};

// ── User helpers ──────────────────────────────────────────────────────────────
export const getUserByKey = (api_key) =>
  one('SELECT * FROM users WHERE api_key = $1', [api_key]);

export const getUserByToken = (token) =>
  one('SELECT * FROM users WHERE dashboard_token = $1', [token]);

export const getUserByEmail = (email) =>
  one('SELECT * FROM users WHERE email = $1', [email]);

export const getUserById = (id) =>
  one('SELECT * FROM users WHERE id = $1', [id]);

export const getUserByCustomerId = (cid) =>
  one('SELECT * FROM users WHERE stripe_customer_id = $1', [cid]);

export const getUserBySubscriptionId = (sid) =>
  one('SELECT * FROM users WHERE stripe_subscription_id = $1', [sid]);

export const createUser = ({ email, name, plan, api_key, dashboard_token, stripe_customer_id }) =>
  run(`
    INSERT INTO users (email, name, plan, api_key, dashboard_token, stripe_customer_id, billing_cycle_start)
    VALUES ($1, $2, $3, $4, $5, $6, extract(epoch from now())::bigint)
  `, [email, name, plan, api_key, dashboard_token, stripe_customer_id]);

export const updateUser = async (id, patch) => {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  await run(`UPDATE users SET ${sets} WHERE id = $${keys.length + 1}`, [...keys.map(k => patch[k]), id]);
};

// Widget chat bumps minute_used + last_seen.
export const bumpMinuteUsed = (id) =>
  run(`UPDATE users SET minute_used = minute_used + 1, last_seen = extract(epoch from now())::bigint WHERE id = $1`, [id]);

// ── Quota ─────────────────────────────────────────────────────────────────────
// Pure — takes an already-loaded user row. Returns { used, limit, bonus, remaining, exhausted }.
export const getQuota = (user) => {
  const limit = planQuota(user.plan);
  const used = user.session_count ?? 0;
  const bonus = user.bonus_sessions ?? 0;
  const remaining = Math.max(0, limit - used) + bonus;
  return { used, limit, bonus, remaining, exhausted: remaining <= 0 };
};

// Increment usage: consume monthly allowance first, then bonus pack sessions.
export const consumeSession = async (user) => {
  const limit = planQuota(user.plan);
  if ((user.session_count ?? 0) < limit) {
    await run('UPDATE users SET session_count = session_count + 1 WHERE id = $1', [user.id]);
  } else if ((user.bonus_sessions ?? 0) > 0) {
    await run('UPDATE users SET bonus_sessions = bonus_sessions - 1 WHERE id = $1', [user.id]);
  } else {
    // over quota — still count it so usage stays accurate
    await run('UPDATE users SET session_count = session_count + 1 WHERE id = $1', [user.id]);
  }
};

export const addBonusSessions = (userId, n) =>
  run('UPDATE users SET bonus_sessions = bonus_sessions + $1 WHERE id = $2', [n, userId]);

// Increment a usage counter on the user row. `column` is whitelisted to the
// known *_used columns so callers can't inject — bumpUsage('id; DROP …') fails.
const USAGE_COLUMNS = new Set(['voice_seconds_used', 'tts_chars_used', 'llm_tokens_used', 'kb_pages_used']);
export const bumpUsage = async (userId, column, amount) => {
  if (!USAGE_COLUMNS.has(column)) throw new Error(`bumpUsage: unknown column ${column}`);
  const n = Number(amount) || 0;
  if (!n) return;
  await run(`UPDATE users SET ${column} = ${column} + $1 WHERE id = $2`, [n, userId]);
};

// Cron: reset session_count for users whose cycle anniversary day == today.
// Guarded by last_quota_reset so an hourly run only resets once per day.
export const resetExpiredCycles = async () => {
  const rows = await all(`SELECT id, billing_cycle_start, last_quota_reset FROM users WHERE billing_cycle_start IS NOT NULL`);
  const now = new Date();
  const startOfTodayUnix = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
  let reset = 0;
  for (const r of rows) {
    const start = new Date(Number(r.billing_cycle_start) * 1000);
    // anniversary: same day-of-month (clamp for short months)
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const anchorDay = Math.min(start.getDate(), dim);
    const alreadyResetToday = r.last_quota_reset != null && Number(r.last_quota_reset) >= startOfTodayUnix;
    if (now.getDate() === anchorDay && !alreadyResetToday) {
      await run(`UPDATE users SET
        session_count = 0,
        voice_seconds_used = 0,
        tts_chars_used = 0,
        llm_tokens_used = 0,
        kb_pages_used = 0,
        last_quota_reset = extract(epoch from now())::bigint
        WHERE id = $1`, [r.id]);
      reset++;
    }
  }
  if (reset) console.log(`[cron] quota reset for ${reset} user(s)`);
  return reset;
};

// ── Sessions ──────────────────────────────────────────────────────────────────
export const createSession = ({ user_id, visitor_id, room_name, lang, page_url }) =>
  run(`
    INSERT INTO sessions (user_id, visitor_id, room_name, lang, page_url)
    VALUES ($1, $2, $3, $4, $5)
  `, [user_id, visitor_id, room_name, lang, page_url]);

export const getSessionByRoom = (room_name) =>
  one('SELECT * FROM sessions WHERE room_name = $1', [room_name]);

export const endSession = (room_name, { duration_sec, cost_eur_cents }) =>
  run(`
    UPDATE sessions SET status = 'ended', ended_at = extract(epoch from now())::bigint,
      duration_sec = $1, cost_eur_cents = $2
    WHERE room_name = $3 AND status = 'open'
  `, [duration_sec, cost_eur_cents, room_name]);

export const markSessionCounted = (room_name) =>
  run(`UPDATE sessions SET counted = 1 WHERE room_name = $1`, [room_name]);

// ── Knowledge base ────────────────────────────────────────────────────────────
export const clearKB = (user_id) =>
  run('DELETE FROM kb_chunks WHERE user_id = $1', [user_id]);

export const insertKBChunk = ({ user_id, url, title, kind, content, embedding }) =>
  run(`
    INSERT INTO kb_chunks (user_id, url, title, kind, content, embedding)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [user_id, url, title, kind, content, embedding]);

export const getKBChunks = (user_id) =>
  all('SELECT id, url, title, kind, content, embedding FROM kb_chunks WHERE user_id = $1', [user_id]);

export const countKBChunks = async (user_id) =>
  Number((await one('SELECT COUNT(*) AS n FROM kb_chunks WHERE user_id = $1', [user_id])).n);

// ── Conversations / leads ─────────────────────────────────────────────────────
export const logConversation = ({ user_id, page_url, visitor_id, message, reply, is_lead }) =>
  run(`
    INSERT INTO conversations (user_id, page_url, visitor_id, message, reply, is_lead)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [user_id, page_url, visitor_id, message, reply, is_lead]);

export const insertLead = ({ user_id, visitor_id, name, email, page_url }) =>
  run(`
    INSERT INTO leads (user_id, visitor_id, name, email, page_url)
    VALUES ($1, $2, $3, $4, $5)
  `, [user_id, visitor_id, name, email, page_url]);

export const getRecentConversations = (user_id, limit = 20) =>
  all('SELECT * FROM conversations WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [user_id, limit]);

// Transcript search — matches message OR reply. Empty q returns latest page.
export const searchConversations = (user_id, q = '', limit = 30, offset = 0) => {
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    return all(`
      SELECT * FROM conversations
      WHERE user_id = $1 AND (message ILIKE $2 OR reply ILIKE $2)
      ORDER BY created_at DESC LIMIT $3 OFFSET $4
    `, [user_id, like, limit, offset]);
  }
  return all(`
    SELECT * FROM conversations WHERE user_id = $1
    ORDER BY created_at DESC LIMIT $2 OFFSET $3
  `, [user_id, limit, offset]);
};

// Past conversations for a visitor — feeds returning-visitor agent memory.
export const getConversationsByVisitor = (user_id, visitor_id, limit = 8) =>
  all(`
    SELECT message, reply, created_at FROM conversations
    WHERE user_id = $1 AND visitor_id = $2 AND visitor_id != ''
    ORDER BY created_at DESC LIMIT $3
  `, [user_id, visitor_id, limit]);

export const getLeads = (user_id) =>
  all('SELECT * FROM leads WHERE user_id = $1 ORDER BY created_at DESC', [user_id]);

// ── Subscriptions ─────────────────────────────────────────────────────────────
// Stripe subscription.deleted → revert plan to free.
export const revertSubscriptionToFree = (subId) =>
  run('UPDATE users SET plan = $1 WHERE stripe_subscription_id = $2', ['free', subId]);

// ── Visitors ──────────────────────────────────────────────────────────────────
export const trackVisitor = async (user_id, visitor_id, { country = null, device = null, browser = null } = {}) => {
  if (!visitor_id) return;
  await run(`
    INSERT INTO visitors (user_id, visitor_id, country, device, browser)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, visitor_id) DO UPDATE SET
      last_seen   = extract(epoch from now())::bigint,
      visit_count = visitors.visit_count + 1,
      country = COALESCE(EXCLUDED.country, visitors.country),
      device  = COALESCE(EXCLUDED.device,  visitors.device),
      browser = COALESCE(EXCLUDED.browser, visitors.browser)
  `, [user_id, visitor_id, country, device, browser]);
};

export const getVisitorStats = async (user_id) => {
  const total = Number((await one('SELECT COUNT(*) n FROM visitors WHERE user_id = $1', [user_id])).n);
  const returning = Number((await one('SELECT COUNT(*) n FROM visitors WHERE user_id = $1 AND visit_count > 1', [user_id])).n);
  const byCountry = await all(`
    SELECT COALESCE(country,'Unknown') label, COUNT(*) n FROM visitors
    WHERE user_id = $1 GROUP BY label ORDER BY n DESC LIMIT 8
  `, [user_id]);
  const byDevice = await all(`
    SELECT COALESCE(device,'Unknown') label, COUNT(*) n FROM visitors
    WHERE user_id = $1 GROUP BY label ORDER BY n DESC
  `, [user_id]);
  const byBrowser = await all(`
    SELECT COALESCE(browser,'Unknown') label, COUNT(*) n FROM visitors
    WHERE user_id = $1 GROUP BY label ORDER BY n DESC LIMIT 6
  `, [user_id]);
  return { total, returning, unique: total - returning, byCountry, byDevice, byBrowser };
};

// ── Cost / margin ─────────────────────────────────────────────────────────────
export const getCostStats = async (user_id) => {
  const cycle = await one(`
    SELECT COALESCE(SUM(cost_eur_cents),0) cents, COUNT(*) n
    FROM sessions WHERE user_id = $1
      AND started_at >= extract(epoch from date_trunc('month', now()))::bigint
  `, [user_id]);
  return { cost_cents: Number(cycle.cents), sessions: Number(cycle.n) };
};

export const logUsageEvent = ({ user_id = null, provider, metric, amount = 0, cost_eur_cents = 0, meta = {} }) =>
  run(`
    INSERT INTO usage_events (user_id, provider, metric, amount, cost_eur_cents, meta)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
  `, [user_id, provider, metric, amount, cost_eur_cents, JSON.stringify(meta ?? {})]);

// ── Provider error log ───────────────────────────────────────────────────────
export const logProviderError = ({ user_id = null, provider, route = null, status = null, error = '', meta = {} }) =>
  run(`
    INSERT INTO provider_errors (user_id, provider, route, status, error, meta)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
  `, [user_id, provider, route, status, String(error).slice(0, 2000), JSON.stringify(meta ?? {})])
    .catch(err => console.error('[logProviderError]', err.message));

export const getRecentProviderErrors = ({ days = 7, limit = 200 } = {}) => {
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 90);
  return all(`
    SELECT id, user_id, provider, route, status, error, meta, created_at
    FROM provider_errors
    WHERE created_at >= extract(epoch from (now() - ($1::int || ' days')::interval))::bigint
    ORDER BY created_at DESC
    LIMIT $2
  `, [safeDays, limit]);
};

export const getProviderErrorSummary = ({ days = 7 } = {}) => {
  const safeDays = Math.min(Math.max(Number(days) || 7, 1), 90);
  return all(`
    SELECT provider, COUNT(*)::bigint count,
           MAX(created_at)::bigint last_at
    FROM provider_errors
    WHERE created_at >= extract(epoch from (now() - ($1::int || ' days')::interval))::bigint
    GROUP BY provider ORDER BY count DESC
  `, [safeDays]);
};

// ── Health checks ────────────────────────────────────────────────────────────
export const logHealthCheck = ({ target, ok, latency_ms = null, error = null }) =>
  run(`
    INSERT INTO health_checks (target, ok, latency_ms, error)
    VALUES ($1, $2, $3, $4)
  `, [target, ok ? 1 : 0, latency_ms, error ? String(error).slice(0, 500) : null]);

export const getRecentHealth = ({ hours = 24 } = {}) => {
  const safeHours = Math.min(Math.max(Number(hours) || 24, 1), 168);
  return all(`
    SELECT target,
      COUNT(*)::bigint total,
      COUNT(*) FILTER (WHERE ok = 1)::bigint ok_count,
      AVG(latency_ms)::int avg_latency,
      MAX(created_at)::bigint last_at,
      (SELECT ok FROM health_checks h2 WHERE h2.target = h.target ORDER BY h2.created_at DESC LIMIT 1) last_ok
    FROM health_checks h
    WHERE created_at >= extract(epoch from (now() - ($1::int || ' hours')::interval))::bigint
    GROUP BY target ORDER BY target
  `, [safeHours]);
};

// ── Admin alerts ─────────────────────────────────────────────────────────────
export const recordAdminAlert = async ({ kind, user_id = null, payload = {} }) => {
  await run(`
    INSERT INTO admin_alerts (kind, user_id, payload)
    VALUES ($1, $2, $3::jsonb)
    ON CONFLICT DO NOTHING
  `, [kind, user_id, JSON.stringify(payload ?? {})]);
};

// True iff a same-kind alert for this user was emitted within the last `hours`.
// Used to de-duplicate the 80%/100% quota emails so the cron doesn't spam.
export const alertEmittedRecently = async ({ kind, user_id = null, hours = 24 }) => {
  const row = await one(`
    SELECT 1 FROM admin_alerts
    WHERE kind = $1
      AND (user_id IS NOT DISTINCT FROM $2)
      AND created_at >= extract(epoch from (now() - ($3::int || ' hours')::interval))::bigint
    LIMIT 1
  `, [kind, user_id, hours]);
  return !!row;
};

// Sum of provider costs (cents) across all users in the last `hours`.
export const getProviderCostWindow = ({ provider, hours = 24 }) =>
  one(`
    SELECT COALESCE(SUM(cost_eur_cents), 0)::bigint cents
    FROM usage_events
    WHERE provider = $1
      AND created_at >= extract(epoch from (now() - ($2::int || ' hours')::interval))::bigint
  `, [provider, hours]);

// Users whose projected cost > threshold of plan revenue, for the alert cron.
export const getCustomersAtRisk = async ({ days = 30, marginThresholdPct = 70 } = {}) => {
  const overview = await getAdminOverview({ days });
  return overview.customers.filter(c => {
    if (!c.revenue_cents) return false;
    return c.estimated_cost_cents > (c.revenue_cents * marginThresholdPct) / 100;
  });
};

const PLAN_REVENUE_CENTS = { free: 0, starter: 4900, business: 9900, agency: 19900 };

export const getAdminOverview = async ({ days = 30 } = {}) => {
  const safeDays = Math.min(Math.max(Number(days) || 30, 1), 365);
  const params = [safeDays];
  const totals = await one(`
    WITH bounds AS (
      SELECT extract(epoch from (now() - ($1::int || ' days')::interval))::bigint AS since
    ),
    session_totals AS (
      SELECT
        COUNT(*)::bigint sessions,
        COALESCE(SUM(duration_sec),0)::bigint voice_seconds,
        COALESCE(SUM(cost_eur_cents),0)::bigint session_cost_cents
      FROM sessions, bounds
      WHERE started_at >= bounds.since
    ),
    conversation_totals AS (
      SELECT COUNT(*)::bigint conversations
      FROM conversations, bounds
      WHERE created_at >= bounds.since
    ),
    lead_totals AS (
      SELECT COUNT(*)::bigint leads
      FROM leads, bounds
      WHERE created_at >= bounds.since
    ),
    usage_totals AS (
      SELECT
        COALESCE(SUM(CASE WHEN metric = 'tts_chars' THEN amount ELSE 0 END),0)::bigint tts_chars,
        COALESCE(SUM(CASE WHEN metric = 'stt_chars' THEN amount ELSE 0 END),0)::bigint stt_chars,
        COALESCE(SUM(CASE WHEN metric = 'llm_tokens' THEN amount ELSE 0 END),0)::bigint llm_tokens,
        COALESCE(SUM(CASE WHEN metric = 'kb_pages' THEN amount ELSE 0 END),0)::bigint kb_pages_crawled,
        COALESCE(SUM(cost_eur_cents),0)::bigint usage_cost_cents
      FROM usage_events, bounds
      WHERE created_at >= bounds.since
    )
    SELECT
      (SELECT COUNT(*) FROM users)::bigint users,
      (SELECT COUNT(*) FROM users WHERE widget_seen_at IS NOT NULL)::bigint installed_widgets,
      (SELECT COUNT(*) FROM users WHERE agent_enabled = 1)::bigint active_agents,
      (SELECT COALESCE(SUM(CASE plan
        WHEN 'starter' THEN 4900
        WHEN 'business' THEN 9900
        WHEN 'agency' THEN 19900
        ELSE 0 END),0) FROM users)::bigint monthly_recurring_cents,
      session_totals.*,
      conversation_totals.*,
      lead_totals.*,
      usage_totals.*
    FROM session_totals, conversation_totals, lead_totals, usage_totals
  `, params);

  const customers = await all(`
    WITH bounds AS (
      SELECT extract(epoch from (now() - ($1::int || ' days')::interval))::bigint AS since
    ),
    s AS (
      SELECT user_id, COUNT(*) sessions, COALESCE(SUM(duration_sec),0) voice_seconds,
        COALESCE(SUM(cost_eur_cents),0) session_cost_cents, MAX(started_at) last_session_at
      FROM sessions, bounds WHERE started_at >= bounds.since GROUP BY user_id
    ),
    c AS (
      SELECT user_id, COUNT(*) conversations, MAX(created_at) last_conversation_at
      FROM conversations, bounds WHERE created_at >= bounds.since GROUP BY user_id
    ),
    l AS (
      SELECT user_id, COUNT(*) leads FROM leads, bounds WHERE created_at >= bounds.since GROUP BY user_id
    ),
    k AS (
      SELECT user_id, COUNT(*) kb_chunks FROM kb_chunks GROUP BY user_id
    ),
    u AS (
      SELECT user_id,
        COALESCE(SUM(CASE WHEN metric = 'tts_chars' THEN amount ELSE 0 END),0) tts_chars,
        COALESCE(SUM(CASE WHEN metric = 'stt_chars' THEN amount ELSE 0 END),0) stt_chars,
        COALESCE(SUM(CASE WHEN metric = 'llm_tokens' THEN amount ELSE 0 END),0) llm_tokens,
        COALESCE(SUM(CASE WHEN metric = 'kb_pages' THEN amount ELSE 0 END),0) kb_pages_crawled,
        COALESCE(SUM(cost_eur_cents),0) usage_cost_cents
      FROM usage_events, bounds WHERE created_at >= bounds.since GROUP BY user_id
    )
    SELECT
      users.id, users.email, users.name, users.plan, users.site_url, users.agent_enabled,
      users.widget_seen_at, users.last_seen, users.session_count, users.bonus_sessions,
      users.kb_status, users.kb_pages,
      users.voice_seconds_used, users.tts_chars_used, users.llm_tokens_used, users.kb_pages_used,
      COALESCE(s.sessions,0)::bigint sessions,
      COALESCE(s.voice_seconds,0)::bigint voice_seconds,
      COALESCE(s.session_cost_cents,0)::bigint session_cost_cents,
      COALESCE(c.conversations,0)::bigint conversations,
      COALESCE(l.leads,0)::bigint leads,
      COALESCE(k.kb_chunks,0)::bigint kb_chunks,
      COALESCE(u.tts_chars,0)::bigint tts_chars,
      COALESCE(u.stt_chars,0)::bigint stt_chars,
      COALESCE(u.llm_tokens,0)::bigint llm_tokens,
      COALESCE(u.kb_pages_crawled,0)::bigint kb_pages_crawled,
      COALESCE(u.usage_cost_cents,0)::bigint usage_cost_cents,
      COALESCE(s.last_session_at, c.last_conversation_at, users.last_seen)::bigint activity_at
    FROM users
    LEFT JOIN s ON s.user_id = users.id
    LEFT JOIN c ON c.user_id = users.id
    LEFT JOIN l ON l.user_id = users.id
    LEFT JOIN k ON k.user_id = users.id
    LEFT JOIN u ON u.user_id = users.id
    ORDER BY activity_at DESC NULLS LAST, users.id DESC
  `, params);

  const byProvider = await all(`
    WITH bounds AS (
      SELECT extract(epoch from (now() - ($1::int || ' days')::interval))::bigint AS since
    )
    SELECT provider, metric, COALESCE(SUM(amount),0)::bigint amount,
      COALESCE(SUM(cost_eur_cents),0)::bigint cost_cents
    FROM usage_events, bounds
    WHERE created_at >= bounds.since
    GROUP BY provider, metric
    ORDER BY provider, metric
  `, params);

  const [providerErrors, health] = await Promise.all([
    getProviderErrorSummary({ days: Math.min(safeDays, 90) }),
    getRecentHealth({ hours: 24 }),
  ]);

  return {
    days: safeDays,
    totals: {
      users: Number(totals.users),
      installed_widgets: Number(totals.installed_widgets),
      active_agents: Number(totals.active_agents),
      monthly_recurring_cents: Number(totals.monthly_recurring_cents),
      sessions: Number(totals.sessions),
      voice_seconds: Number(totals.voice_seconds),
      session_cost_cents: Number(totals.session_cost_cents),
      conversations: Number(totals.conversations),
      leads: Number(totals.leads),
      tts_chars: Number(totals.tts_chars),
      stt_chars: Number(totals.stt_chars),
      llm_tokens: Number(totals.llm_tokens),
      kb_pages_crawled: Number(totals.kb_pages_crawled),
      usage_cost_cents: Number(totals.usage_cost_cents),
    },
    customers: customers.map(row => {
      const planRevenue = PLAN_REVENUE_CENTS[row.plan] ?? 0;
      const cost = Number(row.session_cost_cents) + Number(row.usage_cost_cents);
      const caps = planLimits(row.plan);
      const usagePct = {
        sessions:      planQuota(row.plan) ? (Number(row.session_count) || 0) / planQuota(row.plan) : 0,
        voice_seconds: caps.voice_seconds ? (Number(row.voice_seconds_used) || 0) / caps.voice_seconds : 0,
        tts_chars:     caps.tts_chars     ? (Number(row.tts_chars_used)     || 0) / caps.tts_chars     : 0,
        llm_tokens:    caps.llm_tokens    ? (Number(row.llm_tokens_used)    || 0) / caps.llm_tokens    : 0,
        kb_pages:      caps.kb_pages      ? (Number(row.kb_pages_used)      || 0) / caps.kb_pages      : 0,
      };
      const maxPct = Math.max(...Object.values(usagePct));
      return {
        ...row,
        agent_enabled: !!row.agent_enabled,
        sessions: Number(row.sessions),
        voice_seconds: Number(row.voice_seconds),
        session_cost_cents: Number(row.session_cost_cents),
        conversations: Number(row.conversations),
        leads: Number(row.leads),
        kb_chunks: Number(row.kb_chunks),
        tts_chars: Number(row.tts_chars),
        stt_chars: Number(row.stt_chars),
        llm_tokens: Number(row.llm_tokens),
        kb_pages_crawled: Number(row.kb_pages_crawled),
        usage_cost_cents: Number(row.usage_cost_cents),
        voice_seconds_used: Number(row.voice_seconds_used),
        tts_chars_used:     Number(row.tts_chars_used),
        llm_tokens_used:    Number(row.llm_tokens_used),
        kb_pages_used:      Number(row.kb_pages_used),
        revenue_cents: planRevenue,
        estimated_cost_cents: cost,
        margin_cents: planRevenue - cost,
        margin_pct: planRevenue > 0 ? Math.round(((planRevenue - cost) / planRevenue) * 100) : null,
        plan_limits: caps,
        session_limit: planQuota(row.plan),
        usage_pct: usagePct,
        max_usage_pct: maxPct,
        at_risk: planRevenue > 0 && cost > planRevenue * 0.7,
      };
    }),
    byProvider: byProvider.map(row => ({
      provider: row.provider,
      metric: row.metric,
      amount: Number(row.amount),
      cost_cents: Number(row.cost_cents),
    })),
    providerErrors: providerErrors.map(row => ({
      provider: row.provider,
      count: Number(row.count),
      last_at: Number(row.last_at),
    })),
    health: health.map(row => ({
      target: row.target,
      total: Number(row.total),
      ok_count: Number(row.ok_count),
      avg_latency: row.avg_latency == null ? null : Number(row.avg_latency),
      last_at: Number(row.last_at),
      last_ok: !!row.last_ok,
    })),
  };
};

export const getAnalytics = async (user_id) => {
  const today = await one(`
    SELECT COUNT(*) AS count FROM conversations
    WHERE user_id = $1 AND created_at >= extract(epoch from date_trunc('day', now()))::bigint
  `, [user_id]);

  const week = await all(`
    SELECT to_char(to_timestamp(created_at), 'YYYY-MM-DD') AS day, COUNT(*) AS count
    FROM conversations WHERE user_id = $1
      AND created_at >= extract(epoch from (now() - interval '6 days'))::bigint
    GROUP BY day ORDER BY day
  `, [user_id]);

  const topPages = await all(`
    SELECT page_url, COUNT(*) AS questions
    FROM conversations WHERE user_id = $1
    GROUP BY page_url ORDER BY questions DESC LIMIT 10
  `, [user_id]);

  const topQuestions = await all(`
    SELECT message, COUNT(*) AS count
    FROM conversations WHERE user_id = $1
    GROUP BY message ORDER BY count DESC LIMIT 10
  `, [user_id]);

  const leadsCount = await one('SELECT COUNT(*) AS count FROM leads WHERE user_id = $1', [user_id]);

  return {
    today: Number(today.count),
    week: week.map(w => ({ day: w.day, count: Number(w.count) })),
    topPages: topPages.map(p => ({ page_url: p.page_url, questions: Number(p.questions) })),
    topQuestions: topQuestions.map(q => ({ message: q.message, count: Number(q.count) })),
    leads: Number(leadsCount.count),
  };
};
