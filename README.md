# Navi

AI voice agent for websites. Navi is a SaaS B2B product that lets a customer install one script tag on their site and get a conversational text + voice assistant connected to the site's knowledge base.

Production domains:

- Public website / app: `https://getnavi.dev`
- API + widget: `https://api.getnavi.dev`

Current status: active development, VPS deploy in progress.

---

## Current Architecture

Navi is split into four main parts:

| Area | Role |
| --- | --- |
| Frontend | React/Vite app served on `getnavi.dev`. Includes landing, pricing, checkout flow, user dashboard, and admin dashboard. |
| API backend | Express server on port `8000`. Handles auth-by-token dashboard access, widget config, chat, TTS, Stripe, LiveKit dispatch, KB crawl, analytics, and admin endpoints. |
| Voice worker | `server/agent.js`, a long-running LiveKit agent process. Handles real-time voice conversations. |
| Database | Postgres in Docker. Stores users, API keys, sessions, usage, KB chunks, provider errors, health checks, and admin alerts. |

Deployment on the VPS runs with Docker Compose:

- `postgres`
- `web`
- `agent`

Nginx on the VPS reverse-proxies:

- `https://api.getnavi.dev` -> backend `web:8000`
- `https://getnavi.dev` -> built frontend in `/var/www/navi/dist`

---

## What We Have Done

### Database And Deploy

- Migrated backend from SQLite to Postgres.
- Added Docker deploy flow for `web`, `agent`, and `postgres`.
- Set backend runtime to Node 22.
- Configured production backend port to `8000`.
- Configured public API domain `api.getnavi.dev`.
- Added env-driven CORS for `getnavi.dev` and `www.getnavi.dev`.
- Served `widget.js` and vinyl image assets from the API container.
- Fixed Docker packaging issues for widget assets and server files.

### Stripe

- Integrated Stripe checkout.
- Configured test-mode price IDs for:
  - Starter
  - Business
  - Agency
- Added Stripe webhook endpoint:
  - `https://api.getnavi.dev/api/webhook`
- Verified successful checkout can create/provision a user.

### User Dashboard

- Dashboard opens through `https://getnavi.dev/dashboard?token=...`.
- Dashboard shows install snippet with API key.
- Widget can be installed with:

```html
<script
  src="https://api.getnavi.dev/widget.js"
  data-key="CUSTOMER_API_KEY"
  defer
></script>
```

### Widget

- Fixed public widget asset loading.
- Fixed widget config API key validation.
- Fixed CORS for widget routes so it can run on customer websites.
- Added text chat support.
- Added voice flow through LiveKit.
- Fixed browser audio autoplay by routing remote audio through AudioContext.
- Added ElevenLabs TTS support for more natural voice output.
- Tuned the voice after testing several ElevenLabs voices.
- Current preferred voice is a softer male voice, configured through `ELEVENLABS_VOICE_ID`.

### AI Providers

Configured provider stack:

- Groq for fast LLM replies.
- OpenAI for embeddings and fallback TTS.
- Deepgram for STT.
- ElevenLabs for premium TTS.
- LiveKit for real-time voice rooms and agent dispatch.

### Admin Backend

Task 1 has been completed locally:

- Added `usage_events` table.
- Added usage counters for:
  - voice seconds
  - TTS characters
  - LLM tokens
  - KB pages
- Added automatic tracking for:
  - text chat
  - HTTP TTS
  - voice sessions
  - LiveKit agent usage estimates
  - KB crawl
- Added provider error logging.
- Added health check logging.
- Added admin alert logging.
- Added quota watcher.
- Added rate limiting.
- Added admin endpoints protected by `ADMIN_TOKEN`:
  - `GET /api/admin/overview`
  - `GET /api/admin/errors`
  - `GET /api/admin/health`
- Added React admin dashboard route:
  - `https://getnavi.dev/admin`

Detailed Task 1 report:

- `TASK1_ADMIN_BACKEND_REPORT.md`

---

## Environment Variables

The production VPS uses `.env` in `~/navi`.

Important variables:

```env
APP_URL=https://getnavi.dev
PUBLIC_API_URL=https://api.getnavi.dev
VITE_BACKEND_URL=https://api.getnavi.dev
PORT=8000
ALLOWED_ORIGINS=https://getnavi.dev,https://www.getnavi.dev

ADMIN_TOKEN=...
ADMIN_EMAIL=...

POSTGRES_USER=navi
POSTGRES_PASSWORD=...
POSTGRES_DB=navi
DATABASE_URL=postgresql://navi:POSTGRES_PASSWORD@postgres:5432/navi
DATABASE_SSL=0

STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_STARTER=...
STRIPE_PRICE_BUSINESS=...
STRIPE_PRICE_AGENCY=...

LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://your-livekit-project.livekit.cloud
LIVEKIT_WS_URL=wss://your-livekit-project.livekit.cloud
LIVEKIT_WEBHOOK_SECRET=...

GROQ_API_KEY=...
OPENAI_API_KEY=...
DEEPGRAM_API_KEY=...

ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128

RESEND_API_KEY=...
```

Notes:

- `POSTGRES_PASSWORD` must match the password inside `DATABASE_URL`.
- `ADMIN_TOKEN` is required to open `/admin`.
- `VITE_BACKEND_URL` is build-time only. After changing it, rebuild the frontend.

---

## Local Development

Install dependencies:

```bash
npm install
cd server
npm install
cd ..
```

Run frontend:

```bash
npm run dev
```

Run backend and agent manually:

```bash
node server/index.js
node server/agent.js start
```

The local backend default is `http://localhost:8000`.

---

## VPS Deploy Commands

On the VPS:

```bash
cd ~/navi
git pull
docker compose up -d --build
docker compose ps
docker compose logs --tail=120 web
docker compose logs --tail=120 agent
```

Check API:

```bash
curl -I https://api.getnavi.dev/widget.js
curl -I http://127.0.0.1:8000/
```

Rebuild frontend for `getnavi.dev`:

```bash
cd ~/navi
npm install
VITE_BACKEND_URL=https://api.getnavi.dev npm run build
cp -r /var/www/navi/dist /var/www/navi/dist-backup-$(date +%Y%m%d-%H%M%S)
rm -rf /var/www/navi/dist/*
cp -r dist/* /var/www/navi/dist/
curl -I https://getnavi.dev
```

---

## Opening The Admin Dashboard

1. Make sure the VPS `.env` has:

```env
ADMIN_TOKEN=your_long_secret_token
```

2. Restart the backend:

```bash
cd ~/navi
docker compose up -d --force-recreate web agent
```

3. Rebuild and publish the frontend if `/admin` is not already in the deployed build:

```bash
cd ~/navi
VITE_BACKEND_URL=https://api.getnavi.dev npm run build
cp -r /var/www/navi/dist /var/www/navi/dist-backup-$(date +%Y%m%d-%H%M%S)
rm -rf /var/www/navi/dist/*
cp -r dist/* /var/www/navi/dist/
```

4. Open:

```text
https://getnavi.dev/admin
```

5. Paste the exact `ADMIN_TOKEN`.

The token is stored only in the browser localStorage. If the token is wrong, the admin page will reject access.

---

## What Still Needs To Be Done

### Task 5 - Full General Test

Still to complete carefully:

- Stripe checkout test.
- Stripe webhook test.
- User creation after payment.
- User dashboard test.
- Widget install on a test HTML page and on a real external customer-like page.
- Text chat test.
- Voice test:
  - mic permission
  - listening state
  - speaking state
  - stop button
  - reconnect
  - no double audio
  - no robotic fallback unless providers fail
- Knowledge base crawl.
- Analytics update.
- Admin overview data validation.
- Provider error visibility.
- Usage/cost tracking validation.

### Production Hardening

Recommended before many customers:

- Add Redis-backed rate limiting if running multiple backend replicas.
- Make quota increments fully atomic for high concurrency.
- Schedule `scripts/uptime-check.js` on the VPS.
- Schedule `scripts/pg-backup.sh` and verify backup restore.
- Tune `PLAN_LIMITS` after two weeks of real usage data.
- Add admin controls for customer disable/reactivate.
- Add provider budget alerts with real cost calibration.
- Add a formal staging environment separate from production.

### Product Decisions Still Open

- Final voice choice and ElevenLabs settings.
- Final monthly quotas per plan.
- Final prices and whether session packs remain.
- Whether to enable Stripe Tax and invoicing.
- Whether to expose a customer-facing usage/billing page.

---

## Verification Commands

Useful before deploy:

```bash
node --check server/db.js
node --check server/routes/api.js
node --check server/routes/session.js
node --check server/agent.js
node --check server/index.js
node --check server/quotaWatch.js
node --check scripts/uptime-check.js
npm run lint
npm run build
cd server && npm ci --omit=dev --dry-run
```

---

## Notes

- The current deploy is still test-mode for Stripe unless live keys are swapped in.
- The admin backend is ready locally, but it must be deployed to VPS before `/admin` shows live data.
- Do not commit `.env` or any real API keys.
