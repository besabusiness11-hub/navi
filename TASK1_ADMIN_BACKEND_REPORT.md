# Task 1 - Backend Admin And Usage Tracking Report

## Scope

Task 1 asked for the backend foundation of the Navi admin system:

- `usage_events` table.
- Automatic tracking for TTS, LLM, sessions, and crawl usage.
- `/api/admin/overview` endpoint.
- Admin protection through `ADMIN_TOKEN`.

This report documents what is now present, what I fixed after reviewing the previous work, and what still deserves attention before the final production test pass.

## What Exists Now

### Database

`server/db.js` now creates and manages these operational tables:

- `usage_events`: append-only usage log for sessions, voice seconds, TTS characters, LLM tokens, STT estimates, and crawl pages.
- `provider_errors`: provider/API error history for admin diagnostics.
- `health_checks`: probe history for uptime/provider checks.
- `admin_alerts`: dedupe table for budget and usage alerts.

The user table also has usage counters for:

- `voice_seconds_used`
- `tts_chars_used`
- `llm_tokens_used`
- `kb_pages_used`

The backend exposes helpers for usage limits, usage increments, event logging, provider error logging, health checks, and admin overview aggregation.

### Usage Tracking

Automatic usage tracking is wired in these paths:

- Chat text flow in `server/routes/api.js`
  - Gates `llm_tokens`.
  - Logs `chat_session`.
  - Tracks provider LLM token usage when available.
  - Falls back from Groq to OpenAI when configured.

- TTS HTTP flow in `server/routes/api.js`
  - Gates `tts_chars`.
  - Logs TTS events.
  - Tracks ElevenLabs/OpenAI provider failures.

- Voice session flow in `server/routes/session.js`
  - Gates and logs `voice_seconds`.

- LiveKit agent flow in `server/agent.js`
  - Logs approximate STT, TTS, and LLM usage from the realtime voice agent.
  - Logs agent-side provider/runtime errors into `provider_errors`.

- Knowledge base crawl in `server/routes/api.js`
  - Gates and logs `kb_pages`.

### Admin API

Admin endpoints are protected by `ADMIN_TOKEN`:

- `GET /api/admin/overview`
- `GET /api/admin/errors`
- `GET /api/admin/health`

The overview response includes:

- plan/usage summary cards
- customer rows
- widget health
- provider metric rollups
- recent alerts
- provider error summary
- recent health samples

### Quota And Rate Controls

The server now has:

- Rate limits for widget, chat, TTS, and admin routes.
- Hourly quota watcher in `server/quotaWatch.js`.
- Usage warning and admin alert email helpers in `server/email.js`.
- Environment-driven thresholds in `.env.example`.

## Fixes I Applied During Review

1. Fixed server dependency lockfile.
   - `express-rate-limit` was in `server/package.json` but missing from `server/package-lock.json`.
   - `npm ci --omit=dev --dry-run` now passes.

2. Fixed widget quota response.
   - `/api/widget/config` now disables the widget when any relevant metric is exhausted, not only session quota.
   - It returns a clear reason such as `tts_chars_quota`, `llm_tokens_quota`, `voice_seconds_quota`, or `kb_pages_quota`.
   - It also returns `limits` so the frontend/admin can understand the blocking metric.

3. Fixed TTS error logging scope.
   - ElevenLabs `modelId` and `outputFormat` are now available to the error logger even when the TTS request fails.

4. Standardized local backend fallback URLs.
   - Frontend local fallbacks now point to `http://localhost:8000`, matching the actual backend port.
   - No `localhost:4000` references remain in `src`, `server`, `scripts`, or `.env.example`.

5. Expanded `/api/admin/overview`.
   - It now returns recent provider error summaries and recent health checks directly, instead of requiring separate calls for the core dashboard view.

## Verification

Commands run successfully:

- `node --check server/db.js`
- `node --check server/routes/api.js`
- `node --check server/routes/session.js`
- `node --check server/agent.js`
- `node --check server/index.js`
- `node --check server/quotaWatch.js`
- `node --check scripts/uptime-check.js`
- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd ci --omit=dev --dry-run` inside `server`

Build note:

- Vite reports a large JS chunk warning. This is not a build failure, but code splitting should be considered later for frontend performance.

## Self-Check

Question: Does `usage_events` exist?
Answer: Yes. It is created in `server/db.js` and used by HTTP routes, voice session routes, and the LiveKit agent.

Question: Is TTS tracked?
Answer: Yes. HTTP TTS tracks real text length. Voice-agent TTS is estimated from assistant text because provider-level character usage is not exposed in the current stream path.

Question: Is LLM usage tracked?
Answer: Yes. HTTP chat tracks provider usage when returned and has an estimate fallback. Voice-agent LLM usage is estimated.

Question: Are sessions tracked?
Answer: Yes. Chat sessions, voice sessions, and voice seconds are logged.

Question: Is crawl usage tracked?
Answer: Yes. Crawl page usage is gated and logged as `kb_pages`.

Question: Is `/api/admin/overview` protected?
Answer: Yes. It requires `ADMIN_TOKEN` through `requireAdmin`.

Question: Can exhausted quota block the widget?
Answer: Yes. The widget config now checks all plan metrics, not only sessions.

Question: Is this fully production-final?
Answer: Backend Task 1 is functionally complete, but production hardening still needs the final Task 5 test pass.

## Remaining Risks To Track In Task 5

- LiveKit agent usage is partly estimated, not exact provider billing data.
- `/api/chat` quota gating is not fully atomic under concurrent load. Rate limiting reduces risk, but an atomic SQL update should be considered before high volume.
- Rate limiting is in-process. Multi-replica deployment should use Redis or another shared store.
- `PLAN_LIMITS` are business guesses. Recalibrate after real usage data.
- `scripts/uptime-check.js` exists, but it still needs to be scheduled on the VPS to populate health data continuously.
- Full live test is still needed for checkout, webhook, admin dashboard, widget install, voice, chat, crawl, analytics, and cost tracking.
