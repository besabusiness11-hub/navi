import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import {
  getUserByKey, getUserById, getQuota, consumeSession,
  createSession, getSessionByRoom, endSession, markSessionCounted,
  trackVisitor, SESSION_COST_CENTS,
  getUsageLimits, bumpUsage, logUsageEvent,
} from '../db.js';

const router = Router();

const randomId = () => Math.random().toString(36).slice(2, 12);

// Visitor metadata from the request (UA + CDN country header).
function trackFromReq(userId, visitorId, req) {
  if (!visitorId) return;
  const s = (req.headers['user-agent'] || '').toLowerCase();
  const device = /mobile|iphone|android(?!.*tablet)/.test(s) ? 'Mobile'
    : /ipad|tablet/.test(s) ? 'Tablet' : 'Desktop';
  const browser = /edg\//.test(s) ? 'Edge' : /opr\/|opera/.test(s) ? 'Opera'
    : /firefox/.test(s) ? 'Firefox' : /chrome|crios/.test(s) ? 'Chrome'
    : /safari/.test(s) ? 'Safari' : 'Other';
  const country = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country']
    || req.headers['x-country'] || null;
  trackVisitor(userId, visitorId, { country, device, browser })
    .catch(err => console.error('[trackVisitor]', err.message));
}

// POST /api/session/start  { lang?, visitor_id?, page_url? }   header: x-navi-key
// Quota gate before a voice session. Returns a LiveKit token or 402.
router.post('/start', async (req, res) => {
  const key = req.headers['x-navi-key'] ?? req.query.key;
  if (!key) return res.status(401).json({ error: 'missing x-navi-key' });
  const user = await getUserByKey(key);
  if (!user) return res.status(401).json({ error: 'invalid key' });
  if (!user.agent_enabled) return res.status(403).json({ error: 'agent paused' });

  // Quota check — block before issuing a token. Both the session counter
  // (sessions/mo) and the voice-minutes cap gate here; voice_seconds protects
  // margin when one customer runs many short sessions.
  const quota = getQuota(user);
  if (quota.exhausted) {
    return res.status(402).json({ error: 'quota exhausted', quota });
  }
  const limits = getUsageLimits(user);
  if (limits.voice_seconds.exhausted) {
    return res.status(402).json({ error: 'voice quota exhausted', metric: 'voice_seconds', limits });
  }

  const { LIVEKIT_API_KEY: apiKey, LIVEKIT_API_SECRET: apiSecret, LIVEKIT_WS_URL: wsUrl } = process.env;
  if (!apiKey || !apiSecret || !wsUrl) {
    return res.status(503).json({ error: 'LiveKit not configured' });
  }

  const lang      = req.body.lang || user.lang || 'en';
  const visitorId = req.body.visitor_id || `visitor-${randomId()}`;
  const pageUrl   = req.body.page_url || '';
  const roomName  = `navi-${user.id}-${Date.now()}-${lang}`;

  try {
    const at = new AccessToken(apiKey, apiSecret, {
      identity: visitorId,
      ttl: '2h',
      metadata: JSON.stringify({ userId: user.id, lang, siteUrl: user.site_url || '' }),
    });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    const token = await at.toJwt();

    // Open the session ledger row. Quota is consumed on room.ended (see
    // finalizeSession), so concurrent sessions never double-count and an
    // abandoned token costs nothing.
    await createSession({
      user_id: user.id, visitor_id: visitorId, room_name: roomName,
      lang, page_url: pageUrl,
    });
    trackFromReq(user.id, req.body.visitor_id, req);

    res.json({ token, wsUrl, roomName, quota });
  } catch (err) {
    console.error('[session/start]', err.message);
    res.status(500).json({ error: 'session start failed' });
  }
});

// Close a session, record cost, and consume one quota unit.
// Idempotent: a room is only counted once (sessions.counted flag).
export async function finalizeSession(roomName, durationSec = 0) {
  const session = await getSessionByRoom(roomName);
  if (!session) {
    console.warn(`[session/end] unknown room: ${roomName}`);
    return { ok: false, reason: 'unknown room' };
  }
  if (session.counted) return { ok: true, reason: 'already counted' };

  // Cost model: docx §3 gives ~€0.081 for a 4-min session. Scale by duration,
  // floor at 1 cent so a short session still records cost.
  const minutes = Math.max(durationSec / 60, 0);
  const costCents = Math.max(1, Math.round((minutes / 4) * SESSION_COST_CENTS));

  await endSession(roomName, { duration_sec: Math.round(durationSec), cost_eur_cents: costCents });

  const user = await getUserById(session.user_id);
  if (user) {
    await consumeSession(user);
    await bumpUsage(user.id, 'voice_seconds_used', Math.round(durationSec));
    await logUsageEvent({
      user_id: user.id,
      provider: 'livekit',
      metric: 'voice_seconds',
      amount: Math.round(durationSec),
      cost_eur_cents: 0,
      meta: { route: 'session', room_name: roomName, session_id: session.id },
    }).catch(err => console.error('[usage/session]', err.message));
  }
  await markSessionCounted(roomName);

  console.log(`[session/end] room=${roomName} dur=${Math.round(durationSec)}s cost=${costCents}c`);
  return { ok: true };
}

// Direct HTTP endpoint (manual / fallback). The LiveKit webhook is the
// primary path — see routes/webhook-livekit.js.
router.post('/end', async (req, res) => {
  const { room_name, duration_sec = 0 } = req.body;
  if (!room_name) return res.status(400).json({ error: 'room_name required' });
  const result = await finalizeSession(room_name, Number(duration_sec) || 0);
  res.json(result);
});

export default router;
