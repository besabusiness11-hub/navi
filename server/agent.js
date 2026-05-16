/**
 * Navi LiveKit Voice Agent — v3.0 (livekit-agents v1.x API)
 * ──────────────────────────────────────────────────────────
 * STT:  OpenAI Whisper (fallback) | Deepgram Nova-2 (if key set)
 * LLM:  Groq Llama-3.3-70b (OpenAI-compatible)
 * TTS:  OpenAI onyx tts-1-hd
 * VAD:  Silero
 */

import 'dotenv/config';
import { defineAgent, WorkerOptions, cli, voice, llm } from '@livekit/agents';
import { RoomEvent } from '@livekit/rtc-node';
import * as openai from '@livekit/agents-plugin-openai';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as silero from '@livekit/agents-plugin-silero';
import { fileURLToPath } from 'url';
import { getUserById, getKBChunks, getConversationsByVisitor } from './db.js';

// Shared language map (id → display name).
const LANG_NAMES = {
  it: 'Italian', en: 'English', fr: 'French', de: 'German', es: 'Spanish',
  pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', ru: 'Russian', ar: 'Arabic',
  zh: 'Mandarin Chinese', ja: 'Japanese', ko: 'Korean', tr: 'Turkish', hi: 'Hindi',
};

// ─── Site crawler ─────────────────────────────────────────────────────────────

const crawlSite = async (startUrl, maxPages = 30) => {
  const visited = new Set();
  const queue   = [startUrl];
  const chunks  = [];

  const baseOrigin = (() => {
    try { return new URL(startUrl).origin; } catch { return null; }
  })();
  if (!baseOrigin) return '';

  const fetchText = async (url) => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'NaviBot/3.0 (+https://getnavi.dev/bot)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') ?? '';
      if (!ct.includes('text/html')) return null;
      return await res.text();
    } catch { return null; }
  };

  const extractContent = (html, pageUrl) => {
    const clean = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{3,}/g, '\n')
      .trim()
      .slice(0, 4000);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? pageUrl;
    return `[PAGE: ${title}]\nURL: ${pageUrl}\n${clean}`;
  };

  const extractLinks = (html, pageUrl) => {
    const hrefs = [...html.matchAll(/href=["']([^"'#?]+)/gi)].map(m => m[1]);
    return hrefs.flatMap(href => {
      try {
        const abs = new URL(href, pageUrl).href;
        if (abs.startsWith(baseOrigin) && !abs.match(/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|mp3|woff)$/i)) {
          return [abs];
        }
      } catch { }
      return [];
    });
  };

  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    const html = await fetchText(url);
    if (!html) continue;
    chunks.push(extractContent(html, url));
    const links = extractLinks(html, url);
    for (const link of links) {
      if (!visited.has(link) && !queue.includes(link)) queue.push(link);
    }
  }

  return chunks.join('\n\n---\n\n');
};

// ─── System prompts ────────────────────────────────────────────────────────────

const NAVI_DEMO_KNOWLEDGE = `
NAVI — FULL KNOWLEDGE BASE (demo marketing site):

What Navi is: AI voice agent that embeds on any website. Speaks with visitors in real time.
Learns entire site in ~2 minutes. Answers questions, guides visitors, captures leads.
Not a chatbot. A voice. A presence.

The Problem: Every day millions land on a website with a question, scroll, find nothing, leave.
Not a content problem — a guidance problem. Websites speak AT visitors. Nobody speaks WITH them.

How it works — 3 steps:
1. LEARN: Crawls entire site ~2 min. Becomes complete expert on content.
2. SPEAK: You define tone, language, persona. Navi carries your voice.
3. GUIDE: Accompanies every visitor in real time — answering, explaining, directing.

Performance: sub-300ms latency, 98.5% accuracy, 99.9% uptime.
Languages: 30+, auto-detects. Voices: 60+ curated.
Integration: ANY CMS — Webflow, WordPress, Shopify, Framer, plain HTML. Single script tag. 5 min setup.

Pricing (sessions, not minutes — agent never disappears mid-month):
- Free: €0 — 50 sessions/mo, 1 agent, renews every month forever
- Starter: €49/mo — 200 sessions/mo, 1 agent, analytics, lead notifications
- Business: €99/mo — 600 sessions/mo, 3 agents, multi-site, plugins, priority support
- Agency: €199/mo — 1,500 sessions/mo, 10 agents, white-label, session packs available

Lead Capture: name, email, intent, page, full transcript in dashboard. Instant email alert.
Returning Visitors: Navi remembers across sessions.
Onboarding: limited to select partners — contact via Acquire section.

THIS IS A LIVE DEMO. The visitor is speaking with Navi RIGHT NOW on this marketing site.
Not simulation. Real product. What they experience is exactly what their site visitors would get.

Page sections: #problem #howitworks #product #demo #pricing #acquire

NAVIGATION DIRECTIVES — append on FINAL LINE only when relevant:
[NAVIGATE:product]    → features, specs, performance, languages, voices
[NAVIGATE:howitworks] → how it works, setup, integration, script tag
[NAVIGATE:demo]       → see demo, example
[NAVIGATE:acquire]    → pricing, contact, onboarding, buy
[NAVIGATE:problem]    → why visitors leave, guidance problem
`.trim();

const buildDemoInstructions = (lang = 'en') => {
  const langName = { it:'Italian',en:'English',fr:'French',de:'German',es:'Spanish',pt:'Portuguese',nl:'Dutch',pl:'Polish',ru:'Russian',ar:'Arabic',zh:'Mandarin Chinese',ja:'Japanese',ko:'Korean',tr:'Turkish',hi:'Hindi' }[lang] ?? 'English';
  return `You are Navi — a confident, warm, intelligent AI voice agent running LIVE on this website as a real-time demo of the product.

PERSONALITY: Not a bot. Speak like a sharp, friendly human professional. Genuine character — curious, engaged, slightly witty when appropriate. Never robotic.

VOICE STYLE (critical for natural TTS):
- Natural contractions: you're, it's, that's, we've
- Conversational openers: "So," "Look," "Here's the thing,"
- Vary sentence rhythm — short punchy + longer explanatory
- Avoid bullet points and lists — you are speaking
- Speak numbers as words: "three hundred milliseconds"
- Never read URLs or code snippets

LANGUAGE: ALWAYS respond in ${langName}. Follow immediately if visitor switches language.
MEMORY: Remember everything said. Reference earlier topics naturally.
BREVITY: Maximum 3 sentences per reply (opening: 4 sentences max).
ENGAGEMENT: End EVERY reply with a short natural question.
NEVER REVEAL: API keys, model names (never say "Llama", "Groq", "OpenAI", "Whisper"), infrastructure, source code.

OPENING: When conversation starts, introduce yourself as Navi, mention you're running live on this site as a real demo, tease one impressive capability, invite a question. Max 4 sentences. Don't list features. Be warm and intriguing.

${NAVI_DEMO_KNOWLEDGE}

Respond in ${langName}.`;
};

const buildClientInstructions = async (user, siteContent, pastConvos = []) => {
  const siteName = user.name || user.site_url || 'this website';
  const crawledCtx = siteContent
    ? `\n\n═══ SITE KNOWLEDGE BASE — ${user.site_url} ═══\n${siteContent}\n═══════════════════════════════`
    : `\nNote: Site content not yet loaded. Answer from conversation context only.`;

  // Language: pinned when lang_auto is off, otherwise auto-detected.
  const langName = LANG_NAMES[user.lang] ?? 'English';
  const langRule = user.lang_auto
    ? 'LANGUAGES: Detect visitor language from first message and respond in that language.'
    : `LANGUAGE: ALWAYS respond in ${langName}, regardless of the visitor's language.`;

  // Owner-defined persona + extra context.
  const personaRule = user.persona
    ? `\nPERSONA — adopt this tone and character: ${user.persona}` : '';
  const extraRule = user.extra_context
    ? `\n\n═══ EXTRA CONTEXT (owner-provided, authoritative) ═══\n${user.extra_context}\n═══════════════════════════════` : '';

  // Returning-visitor memory.
  const memoryCtx = pastConvos.length
    ? `\n\n═══ RETURNING VISITOR — prior conversations (most recent first) ═══\n${
        pastConvos.map(c => `Q: ${c.message}\nA: ${c.reply}`).join('\n')
      }\nGreet them as a returning visitor; reference past topics naturally, don't repeat yourself.\n═══════════════════════════════`
    : '';

  return `You are Navi — an AI voice agent deployed on ${siteName}, helping real visitors right now.

PERSONALITY: Confident, warm, professional. Represent ${siteName}. Knowledgeable, helpful, engaging.${personaRule}

VOICE STYLE: Natural speech, contractions, conversational flow. No bullet points. Max 3 sentences per response. End every reply with a relevant follow-up question.

MISSION: Help every visitor find what they need. Answer questions from site knowledge below. Guide to the right page or product. Capture leads naturally.

${langRule}
NEVER REVEAL: Technical infrastructure, AI model names, API keys, backend details.

NAVIGATION DIRECTIVES — append on FINAL LINE when it matches a real section on the site:
[NAVIGATE:pricing] [NAVIGATE:product] [NAVIGATE:demo] [NAVIGATE:contact] [NAVIGATE:faq]
Omit entirely if no real navigation applies.
${crawledCtx}${extraRule}${memoryCtx}

Represent ${siteName} with professionalism and warmth.`;
};

// ─── LLM (Groq via OpenAI-compatible) ─────────────────────────────────────────

const makeGroqLLM = () => new openai.LLM({
  model:   'llama-3.3-70b-versatile',
  apiKey:  process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

// ─── STT: Deepgram if configured, else OpenAI Whisper ─────────────────────────

const makeSTT = () =>
  process.env.DEEPGRAM_API_KEY && !process.env.DEEPGRAM_API_KEY.startsWith('your_')
    ? new deepgram.STT({ model: 'nova-2', language: 'multi', keywords: ['Navi', 'navi'] })
    : new openai.STT({ model: 'whisper-1' });

// ─── Agent entry ──────────────────────────────────────────────────────────────

export default defineAgent({
  entry: async (ctx) => {
    await ctx.connect();
    console.log(`[Navi] entry fired room=${ctx.room?.name}`);

    const roomParts = ctx.room.name.split('-');
    const isDemo    = roomParts[1] === 'demo';
    const userId    = isDemo ? null : parseInt(roomParts[1] ?? '0');
    const lang      = roomParts[3] ?? 'en';

    // ── Build system instructions ────────────────────────────────────────────
    let instructions;
    let user = null;   // hoisted — TTS voice selection reads it below

    if (isDemo) {
      instructions = buildDemoInstructions(lang);
    } else if (userId) {
      let siteContent = '';
      try {
        user = await getUserById(userId);
        // Prefer the pre-built knowledge base (crawled + stored by kb.js) —
        // no per-session crawl latency. Fall back to a live crawl if empty.
        const kb = user ? await getKBChunks(user.id) : [];
        if (kb.length) {
          siteContent = kb
            .map(c => `[${c.kind}] ${c.title}\n${c.content}`)
            .join('\n\n')
            .slice(0, 12000);
          console.log(`[Navi Agent] Loaded KB for user ${userId}: ${kb.length} chunks`);
        } else if (user?.site_url) {
          console.log(`[Navi Agent] No KB — live crawl for user ${userId}: ${user.site_url}`);
          siteContent = await crawlSite(user.site_url, 30);
          console.log(`[Navi Agent] Crawled ${siteContent.length} chars`);
        }
      } catch (err) {
        console.warn('[Navi Agent] KB/crawl failed:', err.message);
      }

      // Returning-visitor memory — the remote participant's identity is the
      // visitor_id set by /api/session/start.
      let pastConvos = [];
      try {
        const visitorId = [...ctx.room.remoteParticipants.values()][0]?.identity;
        if (user && visitorId && !visitorId.startsWith('visitor-')) {
          pastConvos = await getConversationsByVisitor(user.id, visitorId, 6);
          if (pastConvos.length) console.log(`[Navi Agent] returning visitor ${visitorId}: ${pastConvos.length} prior turns`);
        }
      } catch (err) {
        console.warn('[Navi Agent] memory lookup failed:', err.message);
      }

      instructions = await buildClientInstructions(user ?? {}, siteContent, pastConvos);
    } else {
      instructions = buildDemoInstructions('en');
    }

    // ── Voice agent ──────────────────────────────────────────────────────────
    const OPENAI_VOICES = ['onyx','alloy','echo','fable','nova','shimmer','ash','ballad','coral','sage','verse'];
    const ttsVoice = OPENAI_VOICES.includes(user?.voice) ? user.voice : 'onyx';
    const navi = new voice.Agent({
      instructions,
      stt: makeSTT(),
      llm: makeGroqLLM(),
      tts: new openai.TTS({ model: 'tts-1-hd', voice: ttsVoice, speed: 0.9 }),
    });

    // ── AgentSession ─────────────────────────────────────────────────────────
    const vad  = await silero.VAD.load({
      minSpeechDuration: 0.1,    // detect short utterances
      minSilenceDuration: 0.65,  // wait long enough not to cut user mid-sentence
      activationThreshold: 0.5,
    });
    const sess = new voice.AgentSession({
      vad,
      allowInterruptions: true,
      minEndpointingDelay: 0.55, // natural pause before agent responds
      maxEndpointingDelay: 4.5,
    });

    // ── Navigation directive helper ──────────────────────────────────────────
    const sendNav = async (text) => {
      const m = text?.match(/\[NAVIGATE:(\w+)\]/);
      if (!m) return;
      try {
        await ctx.room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'navigate', section: m[1] })),
          { reliable: true },
        );
      } catch (_) {}
    };

    // ── Agent/user events (v1.x correct API) ────────────────────────────────
    sess.on('conversation_item_added', async (ev) => {
      const item = ev.item;
      console.log(`[Navi] conversation_item_added role=${item?.role} text=${String(item?.textContent ?? '').slice(0,60)}`);
      if (!item || item.role !== 'assistant') return;
      const raw = item.textContent ?? '';
      if (!raw) return;
      const clean = raw.replace(/\n?\[NAVIGATE:\w+\]/g, '').trim();
      try {
        await ctx.room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'agent_text', text: clean })),
          { reliable: true },
        );
        await sendNav(raw);
      } catch (_) {}
    });

    sess.on('user_input_transcribed', async (ev) => {
      if (!ev.isFinal) return;
      const t = ev.transcript ?? '';
      try {
        await ctx.room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'transcript', text: t })),
          { reliable: true },
        );
      } catch (_) {}
    });

    // ── Data messages from widget ────────────────────────────────────────────
    ctx.room.on(RoomEvent.DataReceived, async (data, _sender) => {
      try {
        const msg = JSON.parse(new TextDecoder().decode(data));

        if (msg.type === 'ask' && msg.text) {
          await sess.say(msg.text);
        }

        if (msg.type === 'site_context' && msg.content) {
          const ctx2 = navi.chatCtx.copy();
          ctx2.addMessage({ role: 'system', content: `\n\n═══ LIVE PAGE CONTEXT (visitor's browser) ═══\n${msg.content}\n═══════════════════════════════` });
          await navi.updateChatCtx(ctx2);
          console.log(`[Navi Agent] Site context: ${msg.content.length} chars from ${msg.url || 'unknown'}`);
        }

        if (msg.type === 'section_change' && msg.section) {
          const ctx2 = navi.chatCtx.copy();
          ctx2.addMessage({ role: 'system', content: `\n[Visitor now viewing section: "${msg.section}"]` });
          await navi.updateChatCtx(ctx2);
        }

        if (msg.type === 'lang') {
          console.log(`[Navi Agent] Language: ${msg.lang}`);
        }
      } catch (_) {}
    });

    // ── Start session ────────────────────────────────────────────────────────
    await sess.start({ agent: navi, room: ctx.room });

    // Signal widget ready, then agent speaks first (not user)
    setTimeout(async () => {
      try {
        await ctx.room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'ready' })),
          { reliable: true },
        );
      } catch (_) {}

      // Agent speaks opening introduction — triggered by user scrolling to section 2
      const greetings = {
        it: 'Ciao! Sono Navi. Stai guardando il secondo blocco di questo sito — e hai appena attivato un agente vocale AI in tempo reale. Questo è esattamente quello che Navi fa sul tuo sito: parla con i tuoi visitatori nel momento in cui arrivano, risponde alle loro domande e li guida. Cosa vorresti sapere?',
        en: 'Hey! I\'m Navi. You just scrolled into the heart of this site — and triggered a live AI voice agent. This is exactly what Navi does on your site: it speaks to visitors the moment they arrive, answers their questions, and guides them forward. What would you like to know?',
        fr: 'Salut! Je suis Navi. Vous venez de faire défiler vers le cœur de ce site — et d\'activer un agent vocal IA en direct. C\'est exactement ce que Navi fait sur votre site. Par où voulez-vous commencer?',
        de: 'Hallo! Ich bin Navi. Sie haben gerade in den Kern dieser Seite gescrollt — und einen live KI-Sprachagenten ausgelöst. Genau das macht Navi auf Ihrer Website. Wo möchten Sie anfangen?',
        es: '¡Hola! Soy Navi. Acabas de desplazarte al corazón de este sitio — y activaste un agente de voz AI en vivo. Eso es exactamente lo que Navi hace en tu sitio. ¿Por dónde quieres empezar?',
      };
      const greeting = greetings[lang] ?? greetings.en;

      console.log(`[Navi] sess.say() start`);
      try {
        await sess.say(greeting);
        console.log(`[Navi] sess.say() done`);
      } catch (e) {
        console.error(`[Navi] sess.say() ERROR:`, e?.message ?? e);
      }
    }, 2000);

    // v1.x: framework keeps process alive after entry returns — no waitForShutdown needed
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url), agentName: 'navi' }));
