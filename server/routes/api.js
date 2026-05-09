import { Router } from 'express';
import db, {
  getUserByKey, getUserByToken, getUserByEmail,
  createUser, updateUser, logConversation, getRecentConversations,
  getLeads, getAnalytics
} from '../db.js';
import { generateApiKey, generateToken } from '../keys.js';
import { sendWelcomeEmail, sendLeadAlert, sendUnknownAlert } from '../email.js';

const router = Router();

// ── Auth middleware ───────────────────────────────────────────────────────────
const requireKey = (req, res, next) => {
  const key = req.headers['x-navi-key'] ?? req.query.key;
  if (!key) return res.status(401).json({ error: 'missing x-navi-key' });
  const user = getUserByKey(key);
  if (!user) return res.status(401).json({ error: 'invalid key' });
  if (!user.agent_enabled) return res.status(403).json({ error: 'agent paused' });
  req.user = user;
  next();
};

const requireToken = (req, res, next) => {
  const token = req.headers['x-dashboard-token'] ?? req.query.token;
  if (!token) return res.status(401).json({ error: 'missing token' });
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: 'invalid token' });
  req.user = user;
  next();
};

// ── Free plan provision (no Stripe) ──────────────────────────────────────────
router.get('/provision', async (req, res) => {
  const { email, name, plan } = req.query;
  if (!email) return res.status(400).send('email required');

  let user = getUserByEmail(email);
  if (!user) {
    const api_key = generateApiKey();
    const dashboard_token = generateToken();
    createUser.run({ email, name: name ?? '', plan: 'free', api_key, dashboard_token, stripe_customer_id: null });
    user = getUserByEmail(email);
    await sendWelcomeEmail({ email: user.email, name: user.name, plan: 'free', apiKey: user.api_key, dashboardToken: user.dashboard_token }).catch(console.error);
  }

  res.redirect(`${process.env.APP_URL}/dashboard?token=${user.dashboard_token}`);
});

// ── Dashboard: validate token, get user ──────────────────────────────────────
router.get('/me', requireToken, (req, res) => {
  const { id, email, name, plan, api_key, vinyl_color, agent_enabled, minute_used, site_url, created_at } = req.user;
  res.json({ id, email, name, plan, api_key, vinyl_color, agent_enabled: !!agent_enabled, minute_used, site_url, created_at });
});

// ── Dashboard: update settings ────────────────────────────────────────────────
router.patch('/me', requireToken, (req, res) => {
  const allowed = ['name', 'vinyl_color', 'agent_enabled', 'site_url'];
  const patch = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) patch[k] = req.body[k];
  }
  if (Object.keys(patch).length) updateUser(req.user.id, patch);
  res.json({ ok: true });
});

// ── Dashboard: analytics ─────────────────────────────────────────────────────
router.get('/analytics', requireToken, (req, res) => {
  const analytics = getAnalytics(req.user.id);
  res.json(analytics);
});

router.get('/conversations', requireToken, (req, res) => {
  const convos = getRecentConversations(req.user.id);
  res.json(convos);
});

router.get('/leads', requireToken, (req, res) => {
  res.json(getLeads(req.user.id));
});

// ── Widget: chat endpoint ─────────────────────────────────────────────────────
router.post('/chat', requireKey, async (req, res) => {
  const { message, history = [], page_url = '', visitor_id = '' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const user = req.user;
  let reply = '';
  let target = null;

  // Call LLM (Groq preferred, fallback to simple keyword reply)
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('no groq key');

    const systemPrompt = buildSystem(user);
    const msgs = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-12),
      { role: 'user', content: message },
    ];

    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: msgs, max_tokens: 280, temperature: 0.8 }),
    });

    if (!resp.ok) throw new Error(`Groq ${resp.status}`);
    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = parseNav(raw);
    reply = parsed.text;
    target = parsed.target;
  } catch (err) {
    console.error('[chat] LLM error:', err.message);
    reply = "I'm here to help. Try asking me about pricing, features, or how to get started.";
  }

  // Detect lead
  const isLead = /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(message) || /(?:mi chiamo|sono|I am|my name is)\s+\w+/i.test(message);
  if (isLead) {
    const emailMatch = message.match(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i);
    const nameMatch = message.match(/(?:mi chiamo|sono|I am|my name is)\s+(\w+)/i);
    db.prepare('INSERT INTO leads (user_id, visitor_id, name, email, page_url) VALUES (?,?,?,?,?)').run(
      user.id, visitor_id, nameMatch?.[1] ?? null, emailMatch?.[0] ?? null, page_url
    );
    sendLeadAlert({ ownerEmail: user.email, visitorName: nameMatch?.[1], visitorEmail: emailMatch?.[0], pageUrl: page_url, message }).catch(() => {});
  }

  // Log conversation
  logConversation.run({ user_id: user.id, page_url, visitor_id, message, reply, is_lead: isLead ? 1 : 0 });

  // Track minutes (approx 1 min per 5 exchanges)
  db.prepare('UPDATE users SET minute_used = minute_used + 1, last_seen = unixepoch() WHERE id = ?').run(user.id);

  res.json({ reply, target });
});

// ── Widget: TTS proxy ─────────────────────────────────────────────────────────
router.post('/tts', requireKey, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return res.status(503).json({ error: 'tts not configured' });

  try {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1-hd', voice: 'onyx', input: text, speed: 0.92 }),
    });
    if (!resp.ok) throw new Error(`OpenAI TTS ${resp.status}`);
    res.setHeader('Content-Type', 'audio/mpeg');
    resp.body.pipeTo(new WritableStream({
      write(chunk) { res.write(chunk); },
      close() { res.end(); },
    }));
  } catch (err) {
    console.error('[tts]', err.message);
    res.status(500).json({ error: 'tts failed' });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildSystem(user) {
  const siteCtx = user.site_url ? `\nThis agent is deployed on: ${user.site_url}` : '';
  return `You are Navi, an AI voice agent embedded on a website. Speak naturally, confidently, warmly. 2-3 sentences max. Always end with a short question.${siteCtx}
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
