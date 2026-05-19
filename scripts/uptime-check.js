/**
 * Uptime probe — pings the Navi API and each upstream provider, recording the
 * result to the health_checks table. Designed to run from a cron container
 * every 5 minutes (cron line: "every-5-min  node /app/scripts/uptime-check.js").
 *
 * Targets:
 *   - navi-api    HEAD/GET on $API_URL/healthz (DB-backed)
 *   - elevenlabs  GET /v1/user (cheap auth endpoint)
 *   - openai      GET /v1/models (cheap auth endpoint)
 *   - groq        GET /openai/v1/models
 *   - deepgram    GET /v1/projects
 *   - livekit     GET on $LIVEKIT_URL converted to https (TCP probe via fetch)
 *
 * Each target is independent — one failure does not skip the rest. Failures
 * also write a provider_errors row so they aggregate in the admin view.
 */

import 'dotenv/config';
import { logHealthCheck, logProviderError } from '../server/db.js';

const TIMEOUT_MS = Number(process.env.UPTIME_TIMEOUT_MS) || 5000;
const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`;

const probe = async (target, fn) => {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), TIMEOUT_MS);
    let ok = false;
    try {
      ok = await fn(ctrl.signal);
    } finally {
      clearTimeout(timer);
    }
    const latency = Date.now() - start;
    await logHealthCheck({ target, ok, latency_ms: latency });
    console.log(`[uptime] ${target} ${ok ? 'ok' : 'fail'} ${latency}ms`);
    return ok;
  } catch (err) {
    const latency = Date.now() - start;
    await logHealthCheck({ target, ok: false, latency_ms: latency, error: err?.message ?? String(err) });
    await logProviderError({
      provider: target, route: 'uptime', status: null,
      error: err?.message ?? String(err), meta: { latency_ms: latency },
    });
    console.error(`[uptime] ${target} ERR ${err?.message}`);
    return false;
  }
};

const httpProbe = (url, headers = {}) => async (signal) => {
  const resp = await fetch(url, { signal, headers });
  return resp.ok;
};

async function main() {
  const tasks = [];

  tasks.push(probe('navi-api', httpProbe(`${API_URL}/healthz`)));

  if (process.env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY.startsWith('your_')) {
    tasks.push(probe('elevenlabs', httpProbe('https://api.elevenlabs.io/v1/user', {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    })));
  }
  if (process.env.OPENAI_API_KEY) {
    tasks.push(probe('openai', httpProbe('https://api.openai.com/v1/models', {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    })));
  }
  if (process.env.GROQ_API_KEY) {
    tasks.push(probe('groq', httpProbe('https://api.groq.com/openai/v1/models', {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    })));
  }
  if (process.env.DEEPGRAM_API_KEY && !process.env.DEEPGRAM_API_KEY.startsWith('your_')) {
    tasks.push(probe('deepgram', httpProbe('https://api.deepgram.com/v1/projects', {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
    })));
  }
  if (process.env.LIVEKIT_URL) {
    const httpsUrl = process.env.LIVEKIT_URL.replace(/^wss?:\/\//, 'https://');
    tasks.push(probe('livekit', async (signal) => {
      // LiveKit doesn't expose a public health endpoint; fetching the root is
      // enough to verify TLS + DNS + reachability.
      const resp = await fetch(httpsUrl, { signal, method: 'GET' }).catch(() => null);
      return !!resp;
    }));
  }

  await Promise.all(tasks);
  // pg pool keeps the process alive; force exit so cron containers don't hang.
  setTimeout(() => process.exit(0), 100);
}

main().catch(err => {
  console.error('[uptime] fatal:', err);
  process.exit(1);
});
