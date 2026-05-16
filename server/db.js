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
    auto_palette           INTEGER DEFAULT 0
  );

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
      await run('UPDATE users SET session_count = 0, last_quota_reset = extract(epoch from now())::bigint WHERE id = $1', [r.id]);
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
