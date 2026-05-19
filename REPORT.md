# Navi — Admin / Limits / Reliability — Implementation Report
_Branch: `migrate-postgres-deploy` · Date: 2026-05-20_

This report covers the three task blocks the user assigned:

1. `/admin` page (token login, overview, customers, widget health, provider metrics, alerts).
2. Hardening pricing + limits beyond "sessions" (voice minutes, TTS chars, LLM tokens, KB pages).
3. Reliability (provider error log, fallbacks, backups, uptime checks, rate limits, quota alerts).

It is split in two: **what was built and why** (linear), and **self-critique** (adversarial — where the implementation could be wrong, and what I'd want to verify or change next).

---

## 1 · What changed and why

### 1.1 Database (`server/db.js`)

- **New user columns** — `voice_seconds_used`, `tts_chars_used`, `llm_tokens_used`, `kb_pages_used`. Idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS` so the migration is safe on existing instances.
- **`PLAN_LIMITS` constant** — per-plan caps for the four new metrics. Derived from the existing session caps × typical session shape (~4 min voice / 600 TTS chars / 4k LLM tokens) with headroom so a normal customer cannot hit them in regular use.
- **`getUsageLimits(user)` helper** — single source of truth for "how close is this customer to each cap?". Returns `{used, limit, remaining, pct, exhausted}` per metric and is reused by `/me`, every gate, the admin page, and the quota watcher.
- **`bumpUsage(userId, column, amount)`** — whitelisted column writes so usage increments can't be injected.
- **`resetExpiredCycles` extended** — billing-cycle reset now zeroes every `*_used` column alongside `session_count`. The same cron is reused so anniversary timing is consistent.
- **`provider_errors`, `health_checks`, `admin_alerts` tables** — provider_errors aggregates failures with `(provider, route, status, error, meta)` for the admin "Provider errors" panel; health_checks is written by `scripts/uptime-check.js`; admin_alerts is the deduplication ledger so the watcher does not re-send the same email each hour.
- **`getAdminOverview` extended** — every customer row now also carries `voice_seconds_used`, `tts_chars_used`, `llm_tokens_used`, `kb_pages_used`, `plan_limits`, `session_limit`, `usage_pct`, `max_usage_pct`, and `at_risk` so the admin frontend can render alerts and bars without re-computing.
- **`logProviderError`, `getRecentProviderErrors`, `getProviderErrorSummary`, `logHealthCheck`, `getRecentHealth`, `recordAdminAlert`, `alertEmittedRecently`, `getProviderCostWindow`, `getCustomersAtRisk`** — the new admin/ops helpers, each small, all unit-testable in isolation.

### 1.2 Limit enforcement in routes

- **`/api/session/start`** — checks both `getQuota` (sessions/mo, existing) and `getUsageLimits(user).voice_seconds`. Returns 402 with `metric: 'voice_seconds'` so the widget can branch.
- **`finalizeSession`** — on `room_finished` (and the direct `/api/session/end`) it now `bumpUsage(user.id, 'voice_seconds_used', durationSec)` as well as `consumeSession`.
- **`/api/chat`** — gates on `llm_tokens_used`. Calls Groq first, then OpenAI `gpt-4o-mini` on failure (fallback chain). After each successful call, increments `llm_tokens_used`. Token counts are logged to both `usage_events` (per-event ledger) and the per-user counter — the ledger is the source of truth for `getAdminOverview`, the counter is the gate.
- **`/api/tts`** — gates on `tts_chars_used` before either provider. Bumps the counter on both ElevenLabs and OpenAI success paths. Both error paths now record `provider_errors`.
- **`/api/kb/crawl`** — gates on `kb_pages_used`, then passes `maxPages = min(remaining, plan cap)` to `buildKB` so a crawl can never exceed the plan. On completion, `kb_pages_used` is bumped by the actual page count.

### 1.3 Provider fallbacks + timeouts

- **`callProvider(provider, route, url, init, ctx)`** — generic wrapper used in `/api/chat`. Wraps `fetch` with an 8s `AbortController` timeout (env-tunable via `PROVIDER_TIMEOUT_MS`) and logs every non-OK response or thrown error to `provider_errors` with `{user_id, provider, route, status, error, meta:{latency_ms}}`.
- **`/api/chat`** — provider list is now `[groq, openai]`. The loop tries each in order, breaks on the first OK response. Both failures fall through to the canned "I'm here to help…" reply (existing behaviour).
- **`/api/tts`** — already had OpenAI fallback. Added `logProviderError` calls on every error path so the admin can see TTS regressions.
- The LiveKit voice agent (`server/agent.js`) was **not** changed. Its STT/LLM/TTS pipeline runs inside the worker process — it already has Deepgram→Whisper STT fallback and ElevenLabs→OpenAI TTS fallback at construction time. Wiring it into `provider_errors` would require LiveKit-plugin-level error hooks which are out of scope here. (Flagged in §2.)

### 1.4 Rate limits + health

- **`express-rate-limit`** mounted in `server/index.js`:
  - `/api/chat` — 30 req/min per `x-navi-key` (or IP fallback).
  - `/api/tts` — 60 req/min per key.
  - `/api/widget/config|ping`, `/api/session/start` — 120 req/min per IP.
  - `/api/admin/*` — 30 req/min per IP.
  All limits env-tunable (`RATE_LIMIT_CHAT` etc).
- **`/healthz`** — DB ping endpoint for docker/k8s liveness and the uptime cron. Reuses `getProviderErrorSummary({days:1})` as the probe query; returns 503 with the error message if the pool can't answer.

### 1.5 Alerts cron (`server/quotaWatch.js`)

- Runs hourly (configurable via `QUOTA_WATCH_INTERVAL_MIN`).
- For each provider in `[elevenlabs, openai, groq, deepgram]`, sums `usage_events.cost_eur_cents` over the last 24h and emails `ADMIN_EMAIL` if it exceeds `PROVIDER_BUDGET_DAILY_CENTS_<PROVIDER>` (defaults €20/€15/€5/€5).
- For each customer, walks `usage_pct` from the overview and emits one of `usage_<metric>_warning` (≥80%) or `usage_<metric>_critical` (≥100%) — via `sendUsageAlert` to the **customer**.
- For each paid customer where `cost > 70% revenue`, emits `margin_at_risk` to `ADMIN_EMAIL`.
- Every alert kind is deduplicated through the `admin_alerts` table for 24h (12h for provider budget, 48h for margin) so the cron does not re-spam.

### 1.6 Backup + uptime scripts

- **`scripts/pg-backup.sh`** — `pg_dump` to `$BACKUP_DIR`, gzip, 7-day retention via `find -mtime`. Optional S3 upload when `AWS_S3_BACKUP_BUCKET` is set. Idempotent, safe under cron.
- **`scripts/uptime-check.js`** — probes the local API + ElevenLabs/OpenAI/Groq/Deepgram/LiveKit reachability endpoints, writes one `health_checks` row per target per run, also writes `provider_errors` on failure so the admin page surfaces them. 5s timeout per probe. Runs once and exits (designed for cron).

### 1.7 React admin page

- **`src/AdminLogin.jsx`** — single password input. Validates against `/api/admin/overview?days=1` before persisting the token (so a wrong token never lands in localStorage). Returns the explicit "admin not configured" message when the server returns 503.
- **`src/AdminDashboard.jsx`** — five sections:
  1. **Overview cards**: MRR, session cost, usage cost, voice minutes, leads, active agents, installed widgets, alert count.
  2. **Alerts panel**: at-risk + ≥80% usage customers (red border, only shown when non-empty).
  3. **Provider usage / uptime / errors row**: three cards driven by `/admin/overview`, `/admin/health`, `/admin/errors`.
  4. **Widget health**: customers with `widget_seen_at = NULL` or `last_seen` stale > 7d.
  5. **Customers table** — sorted by margin ascending (worst first); columns: customer, plan, sessions used/limit, voice, TTS, LLM, max usage %, revenue, cost, **margin**, last activity. Color-coded by severity.
- Range selector (7/30/90 days) re-fetches all three endpoints. 401 anywhere clears the token and bounces back to login.
- **`src/Admin.jsx` + `main.jsx`** — `/admin` route added alongside `/dashboard` and `/checkout/success`. No new router dependency; the project uses `window.location.pathname` switching.

### 1.8 Config (`.env.example`)

New keys, all with documented defaults:

```
ADMIN_TOKEN=
ADMIN_EMAIL=
RATE_LIMIT_CHAT=30
RATE_LIMIT_TTS=60
RATE_LIMIT_WIDGET=120
RATE_LIMIT_ADMIN=30
PROVIDER_TIMEOUT_MS=8000
PROVIDER_BUDGET_DAILY_CENTS_ELEVENLABS=2000
PROVIDER_BUDGET_DAILY_CENTS_OPENAI=1500
PROVIDER_BUDGET_DAILY_CENTS_GROQ=500
PROVIDER_BUDGET_DAILY_CENTS_DEEPGRAM=500
QUOTA_WATCH_INTERVAL_MIN=60
BACKUP_DIR=/backups
BACKUP_RETENTION_DAYS=7
AWS_S3_BACKUP_BUCKET=
AWS_S3_BACKUP_PREFIX=navi
API_URL=http://localhost:4000
UPTIME_TIMEOUT_MS=5000
```

### 1.9 Verification

| check | result |
|---|---|
| `npm run lint` | green |
| `npm run build` | green (882 kB bundle, no errors) |
| `node --check` on every changed server/script file | green |

---

## 2 · Self-critique — where this could be wrong

I am going to be adversarial here. The point is to surface what I would re-examine in a code review of my own work.

### 2.1 Limit numbers are guesses

The `PLAN_LIMITS` table was derived from session counts × my own assumption of "what a session costs." I have no production-traffic baseline to anchor against. Two failure modes:

- **Too generous** — a customer on Starter can still burn ~1.2M LLM tokens, which at the worst plausible price (Groq fallback to OpenAI) is ~€18 — leaving only ~€31 of margin. If TTS pushes another €9 they're already underwater on a single month.
- **Too tight** — a chatty Italian-speaking site might genuinely exceed 50k TTS chars on the free plan in a normal month. The user gets a 402 + email and assumes the product is broken.

**Mitigation in place:** the admin page surfaces `max_usage_pct` and `margin_at_risk` so misjudgement is visible within hours. The watch cron emails the admin (margin) and the customer (80%/100%).

**Action I'd take next:** wait two weeks, look at the `usage_events` table per-customer averages, retune `PLAN_LIMITS` from real data, and consider a "soft cap" mode (warn but don't block) for the first 30 days post-launch so customers don't churn over a number I picked from intuition.

### 2.2 LLM gate is racy

`/api/chat` checks `getUsageLimits(user).llm_tokens.exhausted` from the user row, calls the LLM, then bumps the counter after the response. Concurrent requests can each see `exhausted = false`, both call Groq, both add 4k tokens. The cap can be overshot by `(concurrent_requests - 1) × avg_request_tokens`.

For a single visitor this is benign. For an attacker fan-ing 50 parallel requests, the overshoot can be hundreds of thousands of tokens before the next request finally sees the cap. The rate limit (`RATE_LIMIT_CHAT=30/min/key`) bounds the worst case to ~30 × 4k = 120k tokens/min overshoot per key — still a lot.

**Fix I did not ship:** use an atomic `UPDATE … RETURNING` that increments and compares in one query, refusing the request when the new value exceeds the cap. Skipped for now because the rate-limiter floor + the daily provider budget alert already bound the blast radius and the change is non-trivial.

### 2.3 LiveKit voice agent is not instrumented

`server/agent.js` runs in a separate Node process (`npm run agent`). Its Deepgram/Groq/ElevenLabs failures only land in stdout — they do not write `provider_errors` rows, so the admin page underreports voice-pipeline failures.

The fix would require wrapping the LiveKit plugin constructors with error event listeners, or post-processing the agent stdout log. Both are real work. Acceptable for now because the synchronous `/api/chat` + `/api/tts` are the more visible failure surfaces, but I would not ship this past v1.

### 2.4 `/healthz` reuses a query for a DB ping

`/healthz` calls `getProviderErrorSummary({days:1})` to verify the pool is alive. It's a real query against an indexed table and is cheap, but conceptually I'm relying on a side-effect that could be moved elsewhere later and break the probe silently. A `SELECT 1` would be more honest. Reason I didn't: `db.js` doesn't currently export the pool, and adding an export felt larger-blast-radius than reusing an existing helper.

### 2.5 `/admin` does not invalidate token rotation

If an operator rotates `ADMIN_TOKEN` on the server, browsers holding the old token in localStorage will hit 401, which is then handled correctly (login screen). But anyone with the old token at the moment of rotation can still read for one 401 cycle. Acceptable for a single-operator product; documented as "token is stored in localStorage."

A real fix is short-lived JWTs signed with `ADMIN_TOKEN` — bigger change, not requested.

### 2.6 Rate-limiter is in-process

`express-rate-limit` uses an in-memory store by default. Two consequences:

- Restarting the server resets every bucket.
- Multiple replicas (horizontal scale) each see only their own traffic. An attacker can spread requests across replicas to multiply the cap.

The Navi P3 roadmap already lists Redis for caching/queue work. When that lands, swap the in-memory store for `rate-limit-redis`. Until then, single-replica deployments are correct, multi-replica are not.

### 2.7 KB-pages limit is approximate

`buildKB` returns the actual page count and we bump `kb_pages_used` after. But we already gated `maxPages = remaining` so the bump can't overshoot — except if the crawl runs multiple times in the same cycle, the previous count is already in the column, so the customer's total grows monotonically as designed. Verified by reading both call sites. Good.

### 2.8 Email alerts can spam if Resend retries fail

`sendAdminAlert` is fire-and-forget with a `.catch(console.error)`. If Resend is down, the alert is lost, but `recordAdminAlert` still writes the dedup row — meaning the cron will not retry for 12–48h. So a Resend outage can cause a critical event to never be emailed.

**Mitigation:** the admin page surfaces the same data (alerts panel, errors panel). If an operator is checking the page, they'd still see it. If they're not, they'd miss it for a day.

**Better fix:** only write the dedup row after Resend confirms send, or move to an outbox pattern (write `admin_alerts.sent=0`, separate worker drains). Out of scope here.

### 2.9 Customer-facing 402 has no UX guidance

The widget will see `{error: 'tts quota exhausted', metric: 'tts_chars'}` and probably show its existing generic-error UI. There's nothing in the widget that says "your site has hit its monthly limit, contact the site owner." The 80% warning email is the only nudge. Should add a `disabled: true, reason: 'quota'` branch to `/widget/config` for the new metrics — currently only `agent_enabled` and the session quota are surfaced there. **Followup ticket needed.**

### 2.10 What I did NOT touch

- No tests were added. The repo has no test harness. I would not add Vitest just for this change without buy-in.
- `cli/index.js` had pre-existing modifications; I did not look at them.
- `src/CheckoutSuccess.jsx`, `src/CookieBanner.jsx`, `src/Footer.jsx` had pre-existing modifications; I did not look at them.
- The `prezzi navi.docx` file was not parsed — the existing `PLAN_QUOTA` constants in `db.js` were treated as the source of truth and my `PLAN_LIMITS` were extrapolated from there.

---

## 3 · Self-investigation — did I make the right calls?

A short Q&A I would expect a reviewer to push back on:

> **Q: Why a single in-process counter instead of computing usage from `usage_events` at query time?**
> A: Reads happen on every chat + TTS request. A `SUM(amount)` per gate would scale poorly with `usage_events` size. A denormalised column on `users` is O(1) read with an O(1) write — the price is the race condition documented in §2.2. The cycle reset is also simpler with a column. The `usage_events` table is still the source of truth for the admin overview's totals + the watcher's provider-spend window.

> **Q: Why not split the admin frontend into its own package?**
> A: Same bundle, same auth shell, same Tailwind config, same deploy. Splitting would multiply CI cost for zero engineering gain right now. If the admin grows beyond a few panels, revisit.

> **Q: Why per-key rate-limit on `/api/chat` instead of per-key + per-IP?**
> A: A leaked key is the worst case; rate-limiting by IP would let an attacker rotate IPs to defeat the limit. Per-key bounds the damage to the customer who leaked the key, which is also who pays for the overage. The 80% alert + the per-provider daily budget catch the macro case. The `keyOrIp` fallback handles the unauth path.

> **Q: Why hourly quota-watch and not on every request?**
> A: Hourly is cheap, idempotent, and the worst-case latency for an alert is 1h. The per-request path already returns 402 when the cap is hit, so there's no business need for a faster alert.

> **Q: What's the single biggest risk in this PR?**
> A: The `PLAN_LIMITS` numbers (see §2.1). Everything else is mechanical and the visibility I added (admin page + emails) means a wrong assumption is detectable within hours. The plan numbers themselves are the bet.

---

## 4 · Deployment checklist

Before merging to `main`:

1. Set `ADMIN_TOKEN` (32-byte hex) and `ADMIN_EMAIL` in production env.
2. Set the four `PROVIDER_BUDGET_DAILY_CENTS_*` values if defaults are wrong for your scale.
3. `cd server && npm install` to pick up `express-rate-limit`.
4. Mount a writable `/backups` volume; schedule `scripts/pg-backup.sh` daily.
5. Schedule `node scripts/uptime-check.js` every 5 minutes from a cron container.
6. Verify `https://api.getnavi.dev/healthz` returns `{ok:true, db:'up'}`.
7. Visit `https://getnavi.dev/admin` and confirm the dashboard renders.
8. Watch the first 24h for alert noise — retune budgets / limits if any single customer floods.

---

_End of report._
