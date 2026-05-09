# Navi

**AI voice agent for your website.** Not a chatbot. A voice. A presence.

Real-time voice conversation, lead capture, 30+ languages. Drops into any site with a single script tag.

![Navi](https://img.shields.io/badge/Status-In%20Development-D4AF37?style=flat-square&labelColor=020405)

---

## What it does

- **Speaks live** with visitors via LiveKit Cloud (sub-300 ms latency)
- **Listens** with Silero VAD + OpenAI Whisper / Deepgram Nova-2 STT
- **Thinks** with Groq Llama 3.3 70B (sub-second LLM)
- **Talks back** with OpenAI TTS-1-HD (or any OpenAI-compatible TTS)
- **Learns** the site by crawling on dispatch
- **Captures leads** (name, email, intent, transcript) via lightweight SQLite

---

## Architecture

```
Browser (React + Vite)
   ├── livekit-client  ─────►  LiveKit Cloud  ◄────  Agent worker (server/agent.js)
   │                                                  ├── STT plugin
   │                                                  ├── LLM plugin (Groq)
   │                                                  └── TTS plugin (OpenAI)
   │
   └── fetch /api/voice-token/demo  ──►  Express API (server/index.js)
                                             ├── token issuance (livekit-server-sdk)
                                             ├── agent dispatch
                                             ├── checkout (Stripe)
                                             └── feedback / leads / analytics
```

Three processes run in dev:

| Process                         | Command                  | Port |
|---------------------------------|--------------------------|------|
| Vite dev server (frontend)      | `npm run dev`            | 5173 |
| Express API                     | `node server/index.js`   | 4000 |
| LiveKit agent worker            | `node server/agent.js start` | (registers with cloud) |

`./start-navi.ps1` launches the server + agent together.

---

## Tech stack

- **React 18** + **Vite 5**
- **Framer Motion** — scroll, drag drawer, crossfade favicon
- **Tailwind CSS**
- **livekit-client** (frontend) + **@livekit/agents** v1.x (Node worker)
- **Groq** — Llama 3.3 70B via OpenAI-compatible API
- **OpenAI** — TTS-1-HD (`onyx`), Whisper STT
- **Silero VAD** — speech endpointing
- **Stripe** — checkout (Free / Starter $79 / Growth $299)
- **Resend** — transactional email
- **node:sqlite** — embedded user / conversation / lead storage

---

## Getting started

### Prerequisites

- Node.js 22+ (uses experimental `node:sqlite`)
- LiveKit Cloud account → API key + secret + WS URL
- Groq API key
- OpenAI API key (TTS + Whisper STT)
- Optional: Deepgram (better STT), Stripe (paid plans), Resend (email)

### Setup

```bash
git clone https://github.com/besabusiness11-hub/navi.git
cd navi

# Frontend deps
npm install

# Backend deps
cd server && npm install && cd ..

# Configure env
cp .env.example .env
# edit .env with VITE_BACKEND_URL=http://localhost:4000

cp .env.example server/.env   # if .env.example present, else create manually
# edit server/.env with all keys (see "Env vars" below)
```

### Run

```bash
# Terminal 1 — frontend
npm run dev

# Terminal 2 — backend + agent (Windows)
./start-navi.ps1

# Or manually:
node server/index.js          # terminal 2
node server/agent.js start    # terminal 3
```

Open `http://localhost:5173`.

### Env vars

`server/.env`:
```
PORT=4000
APP_URL=http://localhost:4000

# LiveKit
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_WS_URL=wss://your-project.livekit.cloud

# AI
GROQ_API_KEY=...
OPENAI_API_KEY=...
DEEPGRAM_API_KEY=...   # optional

# Stripe (optional)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_STARTER=...
STRIPE_PRICE_GROWTH=...

# Email (optional)
RESEND_API_KEY=...
```

---

## Project structure

```
navi/
├── public/                    # vinyl PNGs, widget.js, liquid_waves_bg
├── src/
│   ├── App.jsx                # main landing — hero, problem, product, demo, pricing
│   ├── VoiceAgent.jsx         # draggable voice widget (LiveKit room + AudioContext)
│   ├── CookieBanner.jsx       # consent banner — unlocks audio on accept
│   ├── Footer.jsx             # pull-up drawer with feedback form
│   ├── Dashboard.jsx          # /dashboard route — analytics, agent settings
│   ├── CheckoutSuccess.jsx    # /checkout/success post-Stripe
│   ├── faviconAnimator.js     # canvas crossfade through vinyl colors
│   └── main.jsx               # router (path-based)
├── server/
│   ├── index.js               # Express app — checkout, livekit, api routes
│   ├── agent.js               # LiveKit voice agent worker (defineAgent)
│   ├── db.js                  # node:sqlite — users, conversations, leads
│   ├── email.js               # Resend transactional emails
│   └── routes/
│       ├── livekit.js         # token + dispatch
│       ├── checkout.js        # Stripe sessions
│       ├── webhook.js         # Stripe webhooks
│       └── api.js             # dashboard + chat fallback + TTS proxy
├── start-navi.ps1             # spawns server + agent (Windows)
└── index.html
```

---

## Pages & flow

1. **Hero** — vinyl record, "Your website can speak"
2. **Problem** — guidance gap rationale (auto-opens voice agent on scroll)
3. **Process** — 3 steps: Learn → Speak → Guide
4. **Product** — 6 vinyl color pickers (changes hero, widget, demo mockup live)
5. **Demo** — fake browser with widget mockup
6. **Pricing** — Free / Starter / Growth
7. **Marquee** — fictional client logos
8. **Footer drawer** — pull-up panel with feedback form

---

## Notable engineering

- **Audio autoplay** — Cookie consent click → `window.__naviAC.resume()` (sticky AudioContext) → `createMediaStreamSource` from LiveKit `RemoteAudioTrack.mediaStreamTrack` connected to `destination` → playback bypasses HTMLAudioElement autoplay policy
- **Draggable widget** — Two-layer motion.div: outer for entrance animation (opacity/scale, `originY: 1`), inner for `drag` with viewport-aware `dragConstraints` recomputed on resize. Position resets on every activation
- **Footer drawer** — `motion.aside` with `drag="y"`, `dragMomentum: false`, snap on `onDragEnd` based on velocity / offset → never stops mid-way. Auto-opens when scroll position is within 80 px of page bottom
- **Animated favicon** — 64×64 canvas, alpha-blended crossfade between 6 vinyl PNGs at 12 fps with `t²(3−2t)` smoothstep easing, written via `toDataURL`
- **VAD tuning** — `minSpeechDuration: 0.1`, `minSilenceDuration: 0.65`, `minEndpointingDelay: 0.55`, `maxEndpointingDelay: 4.5` — picks up short utterances without cutting users off

---

## License

© Navi. All rights reserved.
