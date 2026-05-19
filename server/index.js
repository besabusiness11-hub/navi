import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import checkoutRouter from './routes/checkout.js';
import webhookRouter from './routes/webhook.js';
import livekitWebhookRouter from './routes/webhook-livekit.js';
import apiRouter from './routes/api.js';
import livekitRouter from './routes/livekit.js';
import sessionRouter from './routes/session.js';
import { resetExpiredCycles, getProviderErrorSummary } from './db.js';
import { runQuotaWatch } from './quotaWatch.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 4000;

// Stripe webhook needs raw body — mount BEFORE json middleware.
// app.use (not app.post) so the mount path is stripped and the router's
// POST '/' route matches.
app.use('/api/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => { req.rawBody = req.body; next(); },
  webhookRouter);

// LiveKit webhook also needs raw body (signed). Content-Type: application/webhook+json
app.use('/api/livekit-webhook',
  express.raw({ type: ['application/webhook+json', 'application/json'] }),
  (req, res, next) => { req.body = req.body.toString('utf8'); next(); },
  livekitWebhookRouter);

// Dashboard/site origins allowed to call private API routes. Comma-separated
// ALLOWED_ORIGINS env (e.g. "https://getnavi.dev,https://www.getnavi.dev") plus
// APP_URL and the local Vite dev server. Requests with no Origin header
// (server-to-server, Stripe/LiveKit webhooks) are always allowed.
const ALLOWED_ORIGINS = [
  ...(process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  process.env.APP_URL,
  'http://localhost:5173', // Vite dev server
  'http://localhost:3000',
].filter(Boolean);

// Widget endpoints are key-gated (x-navi-key / room_name) and embedded on
// arbitrary customer sites — they must accept any origin. Auth via header, not
// cookies, so credentials stay off (required when origin is '*'). Every other
// route stays restricted to ALLOWED_ORIGINS.
const WIDGET_PATHS = new Set([
  '/api/widget/config', '/api/widget/ping',
  '/api/chat', '/api/tts',
  '/api/voice-token', '/api/voice-dispatch',
  '/api/session/start', '/api/session/end',
]);
const corsDelegate = (req, cb) => {
  if (WIDGET_PATHS.has(req.path)) {
    cb(null, { origin: '*', credentials: false });
  } else {
    cb(null, {
      origin: (origin, c) => (!origin || ALLOWED_ORIGINS.includes(origin) ? c(null, true) : c(new Error('CORS'))),
      credentials: true,
    });
  }
};
app.use(cors(corsDelegate));
app.use(express.json());

// Serve the embeddable widget.js from public/
app.use(express.static(join(__dir, 'public')));
app.get('/widget.js', (_req, res) => {
  res.sendFile(join(__dir, 'public', 'widget.js'));
});

// ── Rate limits ───────────────────────────────────────────────────────────────
// Per-key for widget routes (key = customer billing identity, so abuse maps to
// one account). Per-IP for unauth/admin routes. Limits are conservative enough
// to never block a real visitor session but stop scraped-key spam.
const keyOrIp = (req) => req.headers['x-navi-key'] || req.ip;
const chatLimiter = rateLimit({
  windowMs: 60_000, max: Number(process.env.RATE_LIMIT_CHAT) || 30,
  keyGenerator: keyOrIp, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate limited', metric: 'chat' },
});
const ttsLimiter = rateLimit({
  windowMs: 60_000, max: Number(process.env.RATE_LIMIT_TTS) || 60,
  keyGenerator: keyOrIp, standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate limited', metric: 'tts' },
});
const widgetLimiter = rateLimit({
  windowMs: 60_000, max: Number(process.env.RATE_LIMIT_WIDGET) || 120,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate limited', metric: 'widget' },
});
const adminLimiter = rateLimit({
  windowMs: 60_000, max: Number(process.env.RATE_LIMIT_ADMIN) || 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'rate limited', metric: 'admin' },
});
app.use('/api/chat', chatLimiter);
app.use('/api/tts', ttsLimiter);
app.use(['/api/widget/config', '/api/widget/ping', '/api/session/start'], widgetLimiter);
app.use('/api/admin', adminLimiter);

app.use('/api/checkout', checkoutRouter);
app.use('/api/session', sessionRouter);
app.use('/api', livekitRouter);
app.use('/api', apiRouter);

// Frontend (dashboard + landing) is deployed separately on getnavi.dev — this
// service is API-only. Health check for the reverse proxy / Docker.
app.get('/', (_req, res) => res.json({ ok: true, service: 'navi-api' }));

// Liveness probe — DB ping. Returns 503 with detail if the pool can't answer.
// Used by docker/k8s liveness checks and the uptime-check.js cron.
app.get('/healthz', async (_req, res) => {
  try {
    await getProviderErrorSummary({ days: 1 });
    res.json({ ok: true, db: 'up', ts: Date.now() });
  } catch (err) {
    res.status(503).json({ ok: false, db: 'down', error: err.message });
  }
});

// ── Quota reset cron ──────────────────────────────────────────────────────────
// Reset session_count for users whose billing-cycle anniversary is today.
// Runs hourly; resetExpiredCycles is day-scoped so repeated runs are harmless.
const CRON_INTERVAL_MS = 60 * 60 * 1000;
const runQuotaReset = () =>
  resetExpiredCycles().catch(err => console.error('[cron] reset failed:', err.message));
runQuotaReset();
setInterval(runQuotaReset, CRON_INTERVAL_MS);

// Quota / margin watch — checks per-user limit thresholds and per-provider
// daily spend; sends admin alerts via Resend when thresholds trip.
const QUOTA_WATCH_INTERVAL_MS = (Number(process.env.QUOTA_WATCH_INTERVAL_MIN) || 60) * 60 * 1000;
const tickQuotaWatch = () =>
  runQuotaWatch().catch(err => console.error('[cron] quota watch failed:', err.message));
tickQuotaWatch();
setInterval(tickQuotaWatch, QUOTA_WATCH_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`[Navi] server running on http://localhost:${PORT}`);
});
