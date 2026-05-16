import { Router } from 'express';
import { WebhookReceiver } from 'livekit-server-sdk';
import { finalizeSession } from './session.js';

const router = Router();

const apiKey    = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_WEBHOOK_SECRET || process.env.LIVEKIT_API_SECRET;
const receiver  = apiKey && apiSecret ? new WebhookReceiver(apiKey, apiSecret) : null;

// POST /api/livekit-webhook  — raw body required (configured in index.js).
// LiveKit fires room_finished when the last participant leaves and the room
// is torn down. We close the session ledger and consume one quota unit.
router.post('/', async (req, res) => {
  if (!receiver) {
    console.warn('[livekit-webhook] not configured — ignoring');
    return res.status(503).json({ error: 'livekit webhook not configured' });
  }

  let event;
  try {
    event = await receiver.receive(req.body, req.headers.authorization);
  } catch (err) {
    console.error('[livekit-webhook] verify failed:', err.message);
    return res.status(401).json({ error: 'invalid signature' });
  }

  if (event.event === 'room_finished' && event.room?.name) {
    const room = event.room;
    // creationTime is a unix-seconds int64 (may arrive as string/bigint).
    const created = Number(room.creationTime ?? 0);
    const duration = created > 0 ? Math.max(0, Date.now() / 1000 - created) : 0;
    try {
      await finalizeSession(room.name, duration);
    } catch (err) {
      console.error('[livekit-webhook] finalize error:', err.message);
    }
  }

  res.json({ received: true });
});

export default router;
