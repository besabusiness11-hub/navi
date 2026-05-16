import { Router } from 'express';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { getUserByKey } from '../db.js';

const makeDispatchClient = () => {
  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_URL: url } = process.env;
  if (!apiKey || !apiSecret || !url) return null;
  // AgentDispatchClient needs https:// not wss://
  const httpUrl = url.replace(/^wss?:\/\//, 'https://');
  return new AgentDispatchClient(httpUrl, apiKey, apiSecret);
};

const dispatchAgent = async (roomName, lang) => {
  console.log(`[LiveKit] dispatchAgent called roomName=${roomName} lang=${lang}`);
  const client = makeDispatchClient();
  console.log(`[LiveKit] client=${client ? 'ok' : 'NULL'} LIVEKIT_URL=${process.env.LIVEKIT_URL}`);
  if (!client) return;
  try {
    const result = await client.createDispatch(roomName, 'navi', { metadata: JSON.stringify({ lang }) });
    console.log(`[LiveKit] dispatched agent to ${roomName}`, result);
  } catch (e) {
    console.warn('[LiveKit] dispatch failed:', e?.message ?? e);
  }
};

const router = Router();

const randomId = () => Math.random().toString(36).slice(2, 12);

// GET /api/voice-token — widget, requires x-navi-key
router.get('/voice-token', async (req, res) => {
  const key = req.headers['x-navi-key'] ?? req.query.key;
  if (!key) return res.status(401).json({ error: 'missing x-navi-key' });
  const user = await getUserByKey(key);
  if (!user) return res.status(401).json({ error: 'invalid key' });
  if (!user.agent_enabled) return res.status(403).json({ error: 'agent paused' });

  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_WS_URL: wsUrl } = process.env;
  if (!apiKey || !apiSecret || !wsUrl) {
    return res.status(503).json({ error: 'LiveKit not configured' });
  }

  const lang     = req.query.lang || 'en';
  const identity = req.query.visitor_id || `visitor-${randomId()}`;
  const roomName = `navi-${user.id}-${Date.now()}-${lang}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: '2h',
    metadata: JSON.stringify({ userId: user.id, lang, siteUrl: user.site_url || '' }),
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

  const token = await at.toJwt();
  res.json({ token, wsUrl, roomName });
});

// GET /api/voice-token/demo — no auth, for the marketing demo site
router.get('/voice-token/demo', async (req, res) => {
  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_WS_URL: wsUrl } = process.env;
  if (!apiKey || !apiSecret || !wsUrl) {
    return res.status(503).json({ error: 'LiveKit not configured' });
  }

  const lang     = req.query.lang || 'en';
  const identity = req.query.visitor_id || `demo-${randomId()}`;
  const roomName = `navi-demo-${Date.now()}-${lang}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: '2h',
    metadata: JSON.stringify({ demo: true, lang }),
  });
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });

  const token = await at.toJwt();
  res.json({ token, wsUrl, roomName });
});

// POST /api/voice-dispatch — called by client after room connect
router.post('/voice-dispatch', async (req, res) => {
  const { roomName, lang = 'en' } = req.body;
  if (!roomName) return res.status(400).json({ error: 'roomName required' });
  await dispatchAgent(roomName, lang);
  res.json({ ok: true });
});

export default router;
