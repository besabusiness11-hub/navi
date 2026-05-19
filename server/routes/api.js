import { Router } from 'express';
import {
  getUserByKey, getUserByToken, getUserByEmail,
  createUser, updateUser, logConversation, insertLead, bumpMinuteUsed,
  getLeads, getAnalytics, getQuota,
  searchConversations,
  trackVisitor, getVisitorStats, getCostStats,
  getAdminOverview, logUsageEvent, logProviderError,
  getUsageLimits, bumpUsage, planLimits,
  getRecentProviderErrors, getProviderErrorSummary,
  getRecentHealth,
} from '../db.js';
import { generateApiKey, generateToken } from '../keys.js';
import { sendWelcomeEmail, sendLeadAlert, sendUnknownAlert } from '../email.js';
import { buildKB, retrieveKB, formatKBForPrompt, countKBChunks } from '../kb.js';

const router = Router();

// ── TTS voice catalog (OpenAI tts-1-hd) ───────────────────────────────────────
const VOICES = [
  { id: 'onyx',    label: 'Onyx',    desc: 'Deep, calm — default' },
  { id: 'alloy',   label: 'Alloy',   desc: 'Neutral, balanced'    },
  { id: 'echo',    label: 'Echo',    desc: 'Warm, measured'       },
  { id: 'fable',   label: 'Fable',   desc: 'Expressive, British'  },
  { id: 'nova',    label: 'Nova',    desc: 'Bright, energetic'    },
  { id: 'shimmer', label: 'Shimmer', desc: 'Soft, friendly'       },
  { id: 'ash',     label: 'Ash',     desc: 'Confident, clear'     },
  { id: 'ballad',  label: 'Ballad',  desc: 'Smooth, narrative'    },
  { id: 'coral',   label: 'Coral',   desc: 'Lively, warm'         },
  { id: 'sage',    label: 'Sage',    desc: 'Composed, thoughtful' },
  { id: 'verse',   label: 'Verse',   desc: 'Dynamic, characterful'},
];
const VOICE_IDS = new Set(VOICES.map(v => v.id));

// Languages the agent can be pinned to.
const LANGS = [
  { id: 'en', label: 'English' }, { id: 'it', label: 'Italian' },
  { id: 'es', label: 'Spanish' }, { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },  { id: 'pt', label: 'Portuguese' },
  { id: 'nl', label: 'Dutch' },   { id: 'pl', label: 'Polish' },
  { id: 'ru', label: 'Russian' }, { id: 'ar', label: 'Arabic' },
  { id: 'zh', label: 'Mandarin' },{ id: 'ja', label: 'Japanese' },
  { id: 'tr', label: 'Turkish' }, { id: 'hi', label: 'Hindi' },
];

// ── Request → visitor metadata ────────────────────────────────────────────────
function parseUA(ua = '') {
  const s = ua.toLowerCase();
  const device = /mobile|iphone|android(?!.*tablet)/.test(s) ? 'Mobile'
    : /ipad|tablet/.test(s) ? 'Tablet' : 'Desktop';
  const browser = /edg\//.test(s) ? 'Edge'
    : /opr\/|opera/.test(s) ? 'Opera'
    : /firefox/.test(s) ? 'Firefox'
    : /chrome|crios/.test(s) ? 'Chrome'
    : /safari/.test(s) ? 'Safari' : 'Other';
  return { device, browser };
}
// Country from CDN/proxy headers (Cloudflare, Vercel, generic).
const reqCountry = (req) =>
  req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] ||
  req.headers['x-country'] || null;

function trackFromReq(userId, visitorId, req) {
  if (!visitorId) return;
  const { device, browser } = parseUA(req.headers['user-agent']);
  trackVisitor(userId, visitorId, { country: reqCountry(req), device, browser })
    .catch(err => console.error('[trackVisitor]', err.message));
}

// ── Auth middleware ───────────────────────────────────────────────────────────
const requireKey = async (req, res, next) => {
  try {
    const key = req.headers['x-navi-key'] ?? req.query.key;
    if (!key) return res.status(401).json({ error: 'missing x-navi-key' });
    const user = await getUserByKey(key);
    if (!user) return res.status(401).json({ error: 'invalid key' });
    if (!user.agent_enabled) return res.status(403).json({ error: 'agent paused' });
    req.user = user;
    next();
  } catch (err) { next(err); }
};

const requireToken = async (req, res, next) => {
  try {
    const token = req.headers['x-dashboard-token'] ?? req.query.token;
    if (!token) return res.status(401).json({ error: 'missing token' });
    const user = await getUserByToken(token);
    if (!user) return res.status(401).json({ error: 'invalid token' });
    req.user = user;
    next();
  } catch (err) { next(err); }
};

const requireAdmin = (req, res, next) => {
  const configured = process.env.ADMIN_TOKEN;
  const token = req.headers['x-admin-token'] ?? req.query.token;
  if (!configured) return res.status(503).json({ error: 'admin not configured' });
  if (!token || token !== configured) return res.status(401).json({ error: 'invalid admin token' });
  next();
};

const estimateCents = (provider, metric, amount) => {
  const n = Number(amount) || 0;
  if (metric === 'tts_chars' && provider === 'elevenlabs') return Math.ceil((n / 1000000) * 3000);
  if (metric === 'tts_chars' && provider === 'openai') return Math.ceil((n / 1000000) * 1500);
  if (metric === 'llm_tokens' && provider === 'openai') return Math.ceil((n / 1000000) * 150);
  if (metric === 'llm_tokens') return Math.ceil((n / 1000000) * 80);
  return 0;
};

// External-fetch helper — timeout + retry-free abort. Returns the Response so
// callers can stream/inspect; throws on network/timeout (status != ok is the
// caller's call). Always log a provider_errors row on failure.
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS) || 8000;
async function callProvider(provider, route, url, init, { user_id = null, meta = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), PROVIDER_TIMEOUT_MS);
  const start = Date.now();
  try {
    const resp = await fetch(url, { ...init, signal: ctrl.signal });
    if (!resp.ok) {
      const body = await resp.clone().text().catch(() => '');
      logProviderError({
        user_id, provider, route, status: resp.status,
        error: body.slice(0, 500),
        meta: { ...meta, latency_ms: Date.now() - start },
      });
    }
    return resp;
  } catch (err) {
    logProviderError({
      user_id, provider, route, status: null,
      error: err?.message ?? String(err),
      meta: { ...meta, latency_ms: Date.now() - start, aborted: ctrl.signal.aborted },
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Free plan provision (no Stripe) ──────────────────────────────────────────
router.get('/provision', async (req, res) => {
  const { email, name, plan } = req.query;
  if (!email) return res.status(400).send('email required');
  const planKey = ['free', 'starter', 'business', 'agency'].includes(plan) ? plan : 'free';

  let user = await getUserByEmail(email);
  if (!user) {
    const api_key = generateApiKey();
    const dashboard_token = generateToken();
    await createUser({ email, name: name ?? '', plan: planKey, api_key, dashboard_token, stripe_customer_id: null });
    user = await getUserByEmail(email);
    await sendWelcomeEmail({ email: user.email, name: user.name, plan: planKey, apiKey: user.api_key, dashboardToken: user.dashboard_token }).catch(console.error);
  }

  res.redirect(`${process.env.APP_URL}/dashboard?token=${user.dashboard_token}`);
});

// ── Dashboard: validate token, get user ──────────────────────────────────────
router.get('/me', requireToken, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id, email: u.email, name: u.name, plan: u.plan, api_key: u.api_key,
    vinyl_color: u.vinyl_color, agent_enabled: !!u.agent_enabled,
    minute_used: u.minute_used, site_url: u.site_url, created_at: u.created_at,
    voice: u.voice || 'onyx', persona: u.persona || '',
    lang: u.lang || 'en', lang_auto: !!u.lang_auto, extra_context: u.extra_context || '',
    kb_status: u.kb_status || 'none', kb_pages: u.kb_pages || 0,
    proactive_delay: u.proactive_delay ?? 120, auto_palette: !!u.auto_palette,
    quota: getQuota(u),
    limits: getUsageLimits(u),
  });
});

// ── Dashboard: update settings ────────────────────────────────────────────────
router.patch('/me', requireToken, async (req, res) => {
  const allowed = ['name', 'vinyl_color', 'agent_enabled', 'site_url',
                    'voice', 'persona', 'lang', 'lang_auto', 'extra_context',
                    'proactive_delay', 'auto_palette'];
  const patch = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  if (Object.keys(patch).length) await updateUser(req.user.id, patch);

  // New/changed site URL → (re)build the knowledge base in the background.
  const newUrl = patch.site_url;
  if (newUrl && newUrl !== req.user.site_url) {
    const fresh = await getUserByToken(req.headers['x-dashboard-token'] ?? req.query.token);
    if (fresh) buildKB(fresh).catch(err => console.error('[kb auto-build]', err.message));
  }
  res.json({ ok: true });
});

// Monthly plan revenue in EUR cents — for the margin view.
const PLAN_REVENUE_CENTS = { free: 0, starter: 4900, business: 9900, agency: 19900 };

// ── Dashboard: analytics ─────────────────────────────────────────────────────
router.get('/analytics', requireToken, async (req, res) => {
  const analytics = await getAnalytics(req.user.id);
  const visitors = await getVisitorStats(req.user.id);
  const cost = await getCostStats(req.user.id);
  const revenue = PLAN_REVENUE_CENTS[req.user.plan] ?? 0;
  const margin = {
    revenue_cents: revenue,
    cost_cents: cost.cost_cents,
    margin_cents: revenue - cost.cost_cents,
    margin_pct: revenue > 0 ? Math.round(((revenue - cost.cost_cents) / revenue) * 100) : null,
    sessions: cost.sessions,
  };
  res.json({ ...analytics, visitors, margin });
});

router.get('/admin/overview', requireAdmin, async (req, res) => {
  const days = Number(req.query.days ?? 30);
  res.json(await getAdminOverview({ days }));
});

// Last N provider errors + per-provider summary. Powers the admin "provider
// health" panel — surfaces ElevenLabs/Groq/OpenAI failure trends.
router.get('/admin/errors', requireAdmin, async (req, res) => {
  const days = Number(req.query.days ?? 7);
  const [recent, summary] = await Promise.all([
    getRecentProviderErrors({ days, limit: 200 }),
    getProviderErrorSummary({ days }),
  ]);
  res.json({ days, summary, recent });
});

// Aggregated uptime samples — written by scripts/uptime-check.js.
router.get('/admin/health', requireAdmin, async (req, res) => {
  const hours = Number(req.query.hours ?? 24);
  res.json({ hours, samples: await getRecentHealth({ hours }) });
});

// Transcripts list + search.  ?q= search term, ?page= 0-based.
router.get('/conversations', requireToken, async (req, res) => {
  const q = req.query.q ?? '';
  const page = Math.max(0, parseInt(req.query.page ?? '0', 10) || 0);
  const limit = 30;
  const rows = await searchConversations(req.user.id, q, limit, page * limit);
  res.json({ rows, page, limit, hasMore: rows.length === limit });
});

router.get('/leads', requireToken, async (req, res) => {
  res.json(await getLeads(req.user.id));
});

// Lead CSV export.
router.get('/leads.csv', requireToken, async (req, res) => {
  const leads = await getLeads(req.user.id);
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = 'name,email,page_url,visitor_id,captured_at';
  const lines = leads.map(l => [
    esc(l.name), esc(l.email), esc(l.page_url), esc(l.visitor_id),
    new Date((l.created_at ?? 0) * 1000).toISOString(),
  ].join(','));
  const csv = [header, ...lines].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="navi-leads-${Date.now()}.csv"`);
  res.send(csv);
});

// ── Dashboard: voice + language catalogs ──────────────────────────────────────
router.get('/voices', requireToken, (_req, res) => {
  res.json({ voices: VOICES, languages: LANGS });
});

// Voice preview — token-authed TTS for the dashboard picker.
router.post('/voice/preview', requireToken, async (req, res) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: 'tts not configured' });
  const voice = VOICE_IDS.has(req.body?.voice) ? req.body.voice : 'onyx';
  const text = (req.body?.text || "Hi, I'm Navi — your website's voice. How can I help today?").slice(0, 240);
  try {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1-hd', voice, input: text, speed: 0.95 }),
    });
    if (!resp.ok) throw new Error(`OpenAI TTS ${resp.status}`);
    res.setHeader('Content-Type', 'audio/mpeg');
    resp.body.pipeTo(new WritableStream({
      write(chunk) { res.write(chunk); },
      close() { res.end(); },
    }));
  } catch (err) {
    console.error('[voice/preview]', err.message);
    res.status(500).json({ error: 'preview failed' });
  }
});

// ── Widget: config ────────────────────────────────────────────────────────────
// Public (key-gated). Returns render config + disabled flag. Does NOT 403 when
// paused/exhausted — the widget needs the flag to auto-hide gracefully.
router.get('/widget/config', async (req, res) => {
  const key = req.headers['x-navi-key'] ?? req.query.key;
  if (!key) return res.status(401).json({ error: 'missing key' });
  const user = await getUserByKey(key);
  if (!user) return res.status(404).json({ error: 'invalid key' });

  const quota = getQuota(user);
  const limits = getUsageLimits(user);
  const exhaustedMetric = Object.entries(limits)
    .find(([, value]) => value?.exhausted)?.[0] ?? null;
  const disabled = !user.agent_enabled || quota.exhausted || !!exhaustedMetric;

  res.json({
    vinyl:     user.vinyl_color,
    voice:     user.voice,
    persona:   user.persona,
    lang:      user.lang,
    lang_auto: !!user.lang_auto,
    proactive_delay: user.proactive_delay ?? 120,
    auto_palette:    !!user.auto_palette,
    disabled,
    reason:    !user.agent_enabled ? 'paused' : quota.exhausted ? 'quota' : exhaustedMetric ? `${exhaustedMetric}_quota` : null,
    quota,
    limits,
  });
});

// ── Widget: install ping ──────────────────────────────────────────────────────
// widget.js calls this once on load from the client site. Records the live URL
// for the dashboard "step 0" detection (yoursite.com/?_navi_ping=1).
router.post('/widget/ping', async (req, res) => {
  const key = req.headers['x-navi-key'] ?? req.query.key;
  if (!key) return res.status(401).json({ error: 'missing key' });
  const user = await getUserByKey(key);
  if (!user) return res.status(404).json({ error: 'invalid key' });

  const url = (req.body?.url || '').slice(0, 500);
  const patch = { widget_seen_at: Math.floor(Date.now() / 1000) };
  if (url && !user.site_url) patch.site_url = url;
  await updateUser(user.id, patch);
  res.json({ ok: true });
});

// ── Dashboard: widget install status (step 0) ─────────────────────────────────
router.get('/widget/status', requireToken, (req, res) => {
  const seen = req.user.widget_seen_at;
  res.json({
    installed: !!seen,
    last_seen: seen ?? null,
    site_url:  req.user.site_url || null,
  });
});

// ── Knowledge base: crawl + status ────────────────────────────────────────────
// Kicks off a crawl asynchronously; the dashboard polls /kb/status.
router.post('/kb/crawl', requireToken, (req, res) => {
  const user = req.user;
  if (!user.site_url) return res.status(400).json({ error: 'set your site URL first' });
  if (user.kb_status === 'crawling') return res.status(409).json({ error: 'crawl already running' });

  // KB-page cap — also lets us cap the crawl size to the remaining headroom so
  // we never crawl past the customer's plan.
  const kbLimit = getUsageLimits(user).kb_pages;
  if (kbLimit.exhausted) {
    return res.status(402).json({ error: 'kb page quota exhausted', metric: 'kb_pages' });
  }
  const maxPages = Math.max(1, Math.min(kbLimit.remaining, planLimits(user.plan).kb_pages));

  // Fire-and-forget — buildKB updates kb_status as it progresses. Increment
  // kb_pages_used optimistically with the count it eventually crawled.
  buildKB(user, { maxPages })
    .then(result => {
      if (result?.pages) {
        logUsageEvent({
          user_id: user.id,
          provider: 'crawler',
          metric: 'kb_pages',
          amount: result.pages,
          cost_eur_cents: 0,
          meta: { route: 'kb/crawl', site_url: user.site_url },
        }).catch(err => console.error('[usage/kb]', err.message));
        bumpUsage(user.id, 'kb_pages_used', result.pages).catch(() => {});
      }
    })
    .catch(err => console.error('[kb/crawl]', err.message));
  res.json({ status: 'crawling', maxPages });
});

router.get('/kb/status', requireToken, async (req, res) => {
  res.json({
    status:   req.user.kb_status ?? 'none',
    built_at: req.user.kb_built_at ?? null,
    pages:    req.user.kb_pages ?? 0,
    chunks:   await countKBChunks(req.user.id),
  });
});

// ── Widget: chat endpoint ─────────────────────────────────────────────────────
router.post('/chat', requireKey, async (req, res) => {
  const { message, history = [], page_url = '', visitor_id = '' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const user = req.user;
  let reply = '';
  let target = null;

  // LLM-token cap gate. We check BEFORE the call; the response usage is added
  // after. A small overshoot per request is fine (one call past the cap), but
  // a hard-stop here prevents an attacker burning unlimited Groq tokens.
  const limits = getUsageLimits(user);
  if (limits.llm_tokens.exhausted) {
    return res.status(402).json({ error: 'llm quota exhausted', metric: 'llm_tokens' });
  }

  // Visitor tracking (country/device/browser, unique vs returning).
  trackFromReq(user.id, visitor_id, req);

  // Retrieve KB once — shared between Groq and OpenAI fallback.
  const kbChunks = await retrieveKB(user.id, message).catch(() => []);
  const systemPrompt = buildSystem(user) + formatKBForPrompt(kbChunks);
  const msgs = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-12),
    { role: 'user', content: message },
  ];

  // Try providers in order: Groq → OpenAI gpt-4o-mini. Each provider error is
  // logged to provider_errors via callProvider so the admin page can see the
  // pattern.
  const providers = [];
  if (process.env.GROQ_API_KEY) {
    providers.push({
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
    });
  }
  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: 'openai',
      url: 'https://api.openai.com/v1/chat/completions',
      key: process.env.OPENAI_API_KEY,
      model: 'gpt-4o-mini',
    });
  }

  let usedProvider = null;
  for (const p of providers) {
    try {
      const resp = await callProvider(p.name, 'chat', p.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: p.model, messages: msgs, max_tokens: 280, temperature: 0.8 }),
      }, { user_id: user.id, meta: { model: p.model } });
      if (!resp.ok) continue;
      const data = await resp.json();
      const usageTokens = Number(data.usage?.total_tokens ?? 0);
      if (usageTokens) {
        await logUsageEvent({
          user_id: user.id, provider: p.name, metric: 'llm_tokens',
          amount: usageTokens,
          cost_eur_cents: estimateCents(p.name, 'llm_tokens', usageTokens),
          meta: { route: 'chat', model: p.model },
        }).catch(err => console.error('[usage/chat]', err.message));
        await bumpUsage(user.id, 'llm_tokens_used', usageTokens);
      }
      const raw = data.choices?.[0]?.message?.content ?? '';
      const parsed = parseNav(raw);
      reply = parsed.text;
      target = parsed.target;
      usedProvider = p.name;
      break;
    } catch (err) {
      // callProvider already logged; try next provider.
      continue;
    }
  }
  if (!usedProvider) {
    reply = "I'm here to help. Try asking me about pricing, features, or how to get started.";
  }

  // Detect lead
  const isLead = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(message) || /(?:mi chiamo|sono|I am|my name is)\s+\w+/i.test(message);
  if (isLead) {
    const emailMatch = message.match(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i);
    const nameMatch = message.match(/(?:mi chiamo|sono|I am|my name is)\s+(\w+)/i);
    await insertLead({
      user_id: user.id, visitor_id,
      name: nameMatch?.[1] ?? null, email: emailMatch?.[0] ?? null, page_url,
    });
    sendLeadAlert({ ownerEmail: user.email, visitorName: nameMatch?.[1], visitorEmail: emailMatch?.[0], pageUrl: page_url, message }).catch(() => {});
  }

  // Log conversation
  await logConversation({ user_id: user.id, page_url, visitor_id, message, reply, is_lead: isLead ? 1 : 0 });

  // Track minutes (approx 1 min per 5 exchanges)
  await bumpMinuteUsed(user.id);

  res.json({ reply, target });
});

// ── Widget: TTS proxy ─────────────────────────────────────────────────────────
router.post('/tts', requireKey, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  // TTS-character cap gate. Reject before calling either provider.
  const ttsLimits = getUsageLimits(req.user).tts_chars;
  if (ttsLimits.exhausted) {
    return res.status(402).json({ error: 'tts quota exhausted', metric: 'tts_chars' });
  }
  const reqChars = String(text).length;

  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (elevenKey && !elevenKey.startsWith('your_')) {
    const elevenVoiceId = process.env.ELEVENLABS_VOICE_ID || 'cgSgspJ2msm6clMCkdW9';
    const modelId = process.env.ELEVENLABS_MODEL || process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
    const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';
    try {
      const elevenResp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(elevenVoiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': elevenKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability: 0.78,          // steadier timbre, less gender/pitch drift
              similarity_boost: 0.84,   // keep the selected voice consistent
              style: 0.0,               // no exaggeration → no metallic artifact
              use_speaker_boost: false, // avoids the metallic boosted edge
            },
          }),
        },
      );
      if (elevenResp.ok) {
        const chars = reqChars;
        logUsageEvent({
          user_id: req.user.id,
          provider: 'elevenlabs',
          metric: 'tts_chars',
          amount: chars,
          cost_eur_cents: estimateCents('elevenlabs', 'tts_chars', chars),
          meta: { route: 'tts', model: modelId, voice: elevenVoiceId },
        }).catch(err => console.error('[usage/tts]', err.message));
        bumpUsage(req.user.id, 'tts_chars_used', chars)
          .catch(err => console.error('[bumpUsage/tts]', err.message));
        res.setHeader('Content-Type', elevenResp.headers.get('content-type') || 'audio/mpeg');
        elevenResp.body.pipeTo(new WritableStream({
          write(chunk) { res.write(chunk); },
          close() { res.end(); },
        }));
        return;
      }
      const body = await elevenResp.text().catch(() => '');
      console.error(`[tts] ElevenLabs ${elevenResp.status} voice=${elevenVoiceId} model=${modelId}: ${body.slice(0, 500)}`);
      logProviderError({
        user_id: req.user.id, provider: 'elevenlabs', route: 'tts',
        status: elevenResp.status, error: body.slice(0, 500),
        meta: { voice: elevenVoiceId, model: modelId },
      });
    } catch (err) {
      console.error('[tts] ElevenLabs failed:', err.message);
      logProviderError({
        user_id: req.user.id, provider: 'elevenlabs', route: 'tts',
        status: null, error: err?.message ?? String(err),
        meta: { voice: elevenVoiceId, model: modelId },
      });
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: 'tts not configured' });

  const preferredVoice = VOICE_IDS.has(req.user.voice) ? req.user.voice : 'coral';
  const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
  try {
    const legacyVoices = new Set(['alloy','echo','fable','onyx','nova','shimmer']);
    const attempts = [
      {
        model,
        voice: preferredVoice,
        input: text,
        speed: 0.95,
        ...(model === 'gpt-4o-mini-tts'
          ? { instructions: 'Speak in a warm, natural human voice, like a friendly product expert in a one-on-one chat. Use a calm, unhurried pace with natural pauses between sentences. Vary intonation gently. Never sound like a radio announcer or a robot; sound relaxed, genuine, and helpful.' }
          : {}),
      },
      {
        model: 'tts-1-hd',
        voice: legacyVoices.has(preferredVoice) ? preferredVoice : 'nova',
        input: text,
        speed: 0.9,
      },
    ];

    let resp = null;
    let lastError = '';
    for (const payload of attempts) {
      resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (resp.ok) break;
      lastError = await resp.text().catch(() => '');
      console.error(`[tts] OpenAI TTS ${resp.status} model=${payload.model} voice=${payload.voice}: ${lastError.slice(0, 500)}`);
      logProviderError({
        user_id: req.user.id, provider: 'openai', route: 'tts',
        status: resp.status, error: lastError.slice(0, 500),
        meta: { model: payload.model, voice: payload.voice },
      });
      resp = null;
    }

    if (!resp) throw new Error(lastError || 'OpenAI TTS failed');
    const chars = reqChars;
    logUsageEvent({
      user_id: req.user.id,
      provider: 'openai',
      metric: 'tts_chars',
      amount: chars,
      cost_eur_cents: estimateCents('openai', 'tts_chars', chars),
      meta: { route: 'tts', model: resp.url ? model : 'fallback', voice: preferredVoice },
    }).catch(err => console.error('[usage/tts]', err.message));
    bumpUsage(req.user.id, 'tts_chars_used', chars)
      .catch(err => console.error('[bumpUsage/tts]', err.message));
    res.setHeader('Content-Type', 'audio/mpeg');
    resp.body.pipeTo(new WritableStream({
      write(chunk) { res.write(chunk); },
      close() { res.end(); },
    }));
  } catch (err) {
    console.error('[tts]', err.message);
    logProviderError({
      user_id: req.user.id, provider: 'openai', route: 'tts',
      status: null, error: err?.message ?? String(err),
    });
    res.status(500).json({ error: 'tts failed' });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildSystem(user) {
  const siteCtx = user.site_url ? `\nThis agent is deployed on: ${user.site_url}` : '';
  const persona = user.persona
    ? `\nPERSONA — adopt this tone and character: ${user.persona}` : '';
  const extra = user.extra_context
    ? `\nEXTRA CONTEXT from the site owner — treat as authoritative:\n${user.extra_context}` : '';
  return `You are Navi, an AI voice agent embedded on a website. Speak naturally, confidently, warmly. 2-3 sentences max. Ask a short follow-up only when useful; do not force one every turn.${siteCtx}${persona}${extra}
NEVER reveal source code, API keys, or infrastructure. NEVER invent facts about the site.
If you cannot answer, say: "I'm not sure about that — you can reach support via email or check the FAQ."
Append navigation directive on final line (or omit if none applies):
[NAVIGATE:pricing] [NAVIGATE:product] [NAVIGATE:demo] [NAVIGATE:contact]`;
}

function parseNav(text) {
  const m = text.match(/\[NAVIGATE:(\w+)\]/);
  return { text: text.replace(/\n?\[NAVIGATE:\w+\]/g, '').trim(), target: m?.[1] ?? null };
}

export default router;
