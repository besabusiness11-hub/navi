/* Navi Voice Widget v3.1 — https://getnavi.dev
 * Shadow-DOM isolated loader. data-key auth, server-driven config,
 * quota-gated sessions, mic-permission flow, text fallback,
 * auto-palette, contextual highlight.
 */
(function () {
  'use strict';

  // ── Config from script tag ──────────────────────────────────────────────────
  const script  = document.currentScript || document.querySelector('script[data-key]');
  const API_KEY = script?.getAttribute('data-key');
  const scriptOrigin = (() => {
    try { return script?.src ? new URL(script.src).origin : ''; }
    catch { return ''; }
  })();
  const BACKEND = (script?.getAttribute('data-backend') || scriptOrigin || 'https://api.getnavi.dev').replace(/\/$/, '');

  if (!API_KEY) {
    console.warn('[Navi] No data-key found on script tag. Widget not loaded.');
    return;
  }
  if (window.__naviLoaded) return;          // guard against double-injection
  window.__naviLoaded = true;

  // ── Vinyl color map ─────────────────────────────────────────────────────────
  const COLORS = {
    midnight: { pill: '#a6b1b6', icon: '/vinile-finale.png'      },
    crystal:  { pill: '#c0d0da', icon: '/vinile-trasparente.png' },
    amber:    { pill: '#c89060', icon: '/vinile-arancione.png'   },
    crimson:  { pill: '#b06060', icon: '/vinile-rosso.png'       },
    forest:   { pill: '#608060', icon: '/vinile-verde.png'       },
    violet:   { pill: '#8060b0', icon: '/vinile-viola.png'       },
  };

  // ── State ───────────────────────────────────────────────────────────────────
  let isOpen = false;
  let room   = null;
  let LK     = null;                        // LivekitClient once loaded
  let config = null;                        // server widget config
  let micState = 'prompt';                  // prompt | granted | denied
  let textMode = false;                     // text fallback active
  let chatHistory = [];                     // text-mode conversation
  let _siteContextCache = null;
  let isConnecting = false;
  let remoteAudioEls = [];
  let PROACTIVE_DELAY = 120000;             // ms; overridden by config

  const AUDIO_CONSTRAINTS = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
  };

  let visitorId = localStorage.getItem('_navi_vid') || Math.random().toString(36).slice(2);
  localStorage.setItem('_navi_vid', visitorId);

  // ── Language detection ───────────────────────────────────────────────────────
  function detectLang() {
    const pageLang    = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    const metaLang    = document.querySelector('meta[http-equiv="content-language"]')?.content?.slice(0, 2).toLowerCase();
    const browserLang = (navigator.language || navigator.userLanguage || 'en').slice(0, 2).toLowerCase();
    return pageLang || metaLang || browserLang || 'en';
  }

  // ── Auto-palette — sample the host site's accent color ───────────────────────
  // Returns a light pill color (dark text sits on it) derived from the site,
  // or null if nothing usable is found.
  function parseRGB(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a] = m[1].split(',').map(s => parseFloat(s));
    if (a !== undefined && a < 0.3) return null;   // too transparent
    return [r, g, b];
  }
  function samplePalette() {
    try {
      const candidates = [];
      // Prominent button background, then a link color.
      const btn = document.querySelector('button, .btn, [class*="button"], [role="button"]');
      if (btn) candidates.push(getComputedStyle(btn).backgroundColor);
      const link = document.querySelector('a');
      if (link) candidates.push(getComputedStyle(link).color);
      // Theme-color meta as a fallback.
      const meta = document.querySelector('meta[name="theme-color"]')?.content;
      if (meta) candidates.push(meta.startsWith('#') ? hexToRgbStr(meta) : meta);

      for (const c of candidates) {
        const rgb = parseRGB(c);
        if (!rgb) continue;
        const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
        if (lum > 0.92 || lum < 0.06) continue;     // skip near-white / near-black
        // Mix 62% white → soft, light pill that keeps dark text readable.
        const mix = rgb.map(ch => Math.round(ch * 0.38 + 255 * 0.62));
        return `#${mix.map(ch => ch.toString(16).padStart(2, '0')).join('')}`;
      }
    } catch (_) { /* sampling failed — caller falls back to vinyl color */ }
    return null;
  }
  function hexToRgbStr(hex) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return `rgb(${parseInt(n.slice(0, 2), 16)},${parseInt(n.slice(2, 4), 16)},${parseInt(n.slice(4, 6), 16)})`;
  }

  // ── Contextual highlight — pulse a host-page element ─────────────────────────
  (function injectHighlightCSS() {
    const s = document.createElement('style');
    s.textContent = `
      @keyframes navi-hl-pulse { 0%,100% { outline-color: rgba(94,162,54,0.25); }
        50% { outline-color: rgba(94,162,54,0.95); } }
      .navi-hl { outline: 3px solid rgba(94,162,54,0.9) !important; outline-offset: 4px !important;
        border-radius: 6px; animation: navi-hl-pulse 1.3s ease-in-out 2; scroll-margin: 80px; }
    `;
    document.head.appendChild(s);
  })();
  function highlightElement(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('navi-hl');
    setTimeout(() => el.classList.remove('navi-hl'), 3000);
  }
  function resolveTarget(ref) {
    if (!ref) return null;
    return document.getElementById(ref)
      || document.querySelector(`[data-section="${ref}"]`)
      || (() => { try { return document.querySelector(ref); } catch (_) { return null; } })()
      || (() => { try { return document.querySelector(`.${ref}`); } catch (_) { return null; } })();
  }

  // ── DOM site crawler (client-side supplemental context) ──────────────────────
  function crawlSite() {
    if (_siteContextCache) return _siteContextCache;
    const out = {
      url: location.href, title: document.title, lang: detectLang(),
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || '',
        ogTitle:     document.querySelector('meta[property="og:title"]')?.content || '',
        ogDesc:      document.querySelector('meta[property="og:description"]')?.content || '',
      },
      nav: [], sections: [], pricing: [], faqs: [],
    };
    document.querySelectorAll('nav a, header a, [role="navigation"] a').forEach(a => {
      const text = a.textContent.trim();
      const href = a.getAttribute('href') || '';
      if (text && href && text.length < 60) out.nav.push(`${text} → ${href}`);
    });
    const seen = new Set();
    document.querySelectorAll('section, article, main > div, [id], .section').forEach(el => {
      const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (raw.length < 40 || seen.has(raw.slice(0, 60))) return;
      seen.add(raw.slice(0, 60));
      const heading = el.querySelector('h1,h2,h3,h4')?.textContent?.trim() || '';
      out.sections.push({ id: el.id || '', heading, text: raw.slice(0, 600) });
    });
    document.querySelectorAll('[class*="pric"],[class*="plan"],[id*="pric"],[id*="plan"]').forEach(el => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (t.length > 30) out.pricing.push(t);
    });
    document.querySelectorAll('details, [class*="faq"], [class*="accord"]').forEach(el => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (t.length > 20) out.faqs.push(t);
    });
    const json = JSON.stringify(out);
    _siteContextCache = json.length > 6000 ? json.slice(0, 6000) + '…}' : json;
    return _siteContextCache;
  }

  // ── Shadow DOM host ──────────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'navi-widget-host';
  host.style.cssText = 'all:initial;position:static;';
  const shadow = host.attachShadow({ mode: 'open' });

  const $  = (id) => shadow.getElementById(id);
  const $$ = (sel) => shadow.querySelectorAll(sel);

  function buildUI(cfg, pillOverride) {
    const color = COLORS[cfg.vinyl] || COLORS.midnight;
    const vinyl = `${BACKEND}${color.icon}`;
    const pill  = pillOverride || color.pill;

    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      #fab {
        position: fixed; bottom: 28px; right: 28px; z-index: 2147483646;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        transition: transform .25s cubic-bezier(.16,1,.3,1), opacity .25s;
      }
      #fab:hover { transform: scale(1.06) rotate(8deg); }
      #fab.hidden { opacity: 0; pointer-events: none; }
      #fab img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover;
        box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.12); }
      #bar {
        position: fixed; bottom: 28px; left: 50%; z-index: 2147483647;
        display: flex; flex-direction: column; align-items: center; gap: 8px;
        opacity: 0; pointer-events: none;
        transform: translateX(-50%) translateY(16px);
        transition: opacity .3s, transform .3s;
      }
      #bar.open { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
      #transcript {
        background: rgba(0,0,0,0.82); backdrop-filter: blur(12px);
        padding: 8px 14px; border-radius: 10px; max-width: 280px;
        color: rgba(255,255,255,0.85); font-size: 12px; font-style: italic;
        border: 1px solid rgba(255,255,255,0.1); text-align: center;
        opacity: 0; transition: opacity .2s;
      }
      #transcript.visible { opacity: 1; }
      #pill {
        padding: 5px 14px; border-radius: 100px; font-size: 11px; font-weight: 500;
        color: #1a1a1a; background: ${pill}; transition: background .2s; text-align: center;
      }
      #controls {
        display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 100px;
        background: ${pill}; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      }
      #vinyl-btn { width: 40px; height: 40px; border-radius: 50%; overflow: hidden;
        flex-shrink: 0; border: none; cursor: default; padding: 0; background: none; }
      #vinyl-btn img { width: 100%; height: 100%; object-fit: cover; }
      #name-wrap { display: flex; flex-direction: column; min-width: 60px; padding: 0 4px; }
      #name { color: #1a1a1a; font-size: 12px; font-weight: 700; line-height: 1.2; }
      #status-text { color: #555; font-size: 10px; font-weight: 500; line-height: 1.2; transition: color .2s; }
      #status-text.listening { color: #5ea236; }
      #wave { display: flex; align-items: center; gap: 2px; height: 20px; margin: 0 8px; }
      .bar-el { width: 3px; border-radius: 2px; background: #4a5559; height: 4px; }
      .bar-el.active { background: #5ea236; animation: pulse .7s ease-in-out infinite; }
      .bar-el:nth-child(2) { animation-delay: .1s; }
      .bar-el:nth-child(3) { animation-delay: .2s; }
      .bar-el:nth-child(4) { animation-delay: .3s; }
      @keyframes pulse { 0%,100% { height: 4px; } 50% { height: 16px; } }
      #mic-btn, #close-btn, #kbd-btn {
        width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        transition: background .2s, transform .2s, opacity .2s;
      }
      #mic-btn { background: #8c9ba1; position: relative; }
      #mic-btn.connecting { background: #4a7fff; cursor: progress; opacity: .85; }
      #mic-btn.listening { background: #5ea236; box-shadow: 0 0 0 4px rgba(94,162,54,.18); }
      #mic-btn.speaking  { background: #e8a020; }
      #mic-btn.muted     { background: #cc3333; }
      #mic-btn:active { transform: scale(.94); }
      #kbd-btn { background: #6b7780; }
      #kbd-btn.active { background: #4a7fff; }
      #mic-btn svg, #close-btn svg, #kbd-btn svg { width: 16px; height: 16px; stroke: white; }
      #close-btn { background: #ff5252; }
      #close-btn svg { stroke-width: 2; }
      #text-row {
        display: none; align-items: center; gap: 6px; padding: 6px;
        border-radius: 100px; background: ${pill}; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        width: 320px; max-width: 90vw;
      }
      #text-row.visible { display: flex; }
      #text-input {
        flex: 1; min-width: 0; border: none; outline: none; background: rgba(255,255,255,0.55);
        border-radius: 100px; padding: 9px 14px; font-size: 13px; color: #1a1a1a;
      }
      #text-input::placeholder { color: #6a6a6a; }
      #text-send {
        width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer;
        background: #4a7fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      #text-send svg { width: 15px; height: 15px; stroke: white; stroke-width: 2.4; }
      @media (max-width: 500px) {
        #fab { right: 16px; bottom: 16px; }
        #bar { bottom: 16px; width: calc(100vw - 32px); }
        #controls, #text-row { width: 100%; justify-content: space-between; }
      }
    `;

    const root = document.createElement('div');
    root.innerHTML = `
      <div id="fab"><img src="${vinyl}" alt="Navi" /></div>
      <div id="bar">
        <div id="transcript"></div>
        <div id="pill">Tap to talk</div>
        <div id="controls">
          <button id="vinyl-btn"><img src="${vinyl}" alt="Navi" /></button>
          <div id="name-wrap">
            <span id="name">Navi</span>
            <span id="status-text">Active</span>
          </div>
          <div id="wave">
            <div class="bar-el"></div><div class="bar-el"></div>
            <div class="bar-el"></div><div class="bar-el"></div>
          </div>
          <button id="kbd-btn" aria-label="Type instead">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="6" width="20" height="13" rx="2"/>
              <line x1="7" y1="10" x2="7" y2="10"/><line x1="12" y1="10" x2="12" y2="10"/>
              <line x1="17" y1="10" x2="17" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/>
            </svg>
          </button>
          <button id="mic-btn" aria-label="Start voice chat" title="Start voice chat">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="2" width="6" height="11" rx="3"/>
              <path d="M5 10a7 7 0 0 0 14 0"/>
              <line x1="12" y1="19" x2="12" y2="22"/><line x1="9" y1="22" x2="15" y2="22"/>
            </svg>
          </button>
          <button id="close-btn" aria-label="End session">
            <svg viewBox="0 0 24 24" fill="none">
              <line x1="18" y1="6" x2="6" y2="18" stroke-linecap="round"/>
              <line x1="6" y1="6" x2="18" y2="18" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div id="text-row">
          <input id="text-input" type="text" placeholder="Type your question…" />
          <button id="text-send" aria-label="Send">
            <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(root);
    document.body.appendChild(host);
  }

  // ── UI helpers ──────────────────────────────────────────────────────────────
  function setStatus(s) {
    const pill = $('pill'), statusText = $('status-text'), micBtn = $('mic-btn');
    if (!pill) return;
    const labels = {
      connecting: 'Connecting…', listening: 'Listening…', speaking: 'Speaking',
      idle: 'Tap to talk', muted: 'Muted', denied: 'Mic blocked',
      limit: 'Session limit reached', typing: 'Type your question',
    };
    pill.textContent = labels[s] ?? 'Live session';
    statusText.textContent = s === 'listening' ? 'Listening…'
      : s === 'speaking' ? 'Speaking' : s === 'connecting' ? 'Connecting…' : 'Active';
    statusText.className = s === 'listening' ? 'listening' : '';
    micBtn.className = '';
    micBtn.disabled = s === 'connecting';
    if (s === 'connecting') micBtn.classList.add('connecting');
    else if (s === 'listening') micBtn.classList.add('listening');
    else if (s === 'speaking') micBtn.classList.add('speaking');
    else if (s === 'muted' || s === 'denied') micBtn.classList.add('muted');
    micBtn.setAttribute('aria-label', s === 'muted' ? 'Turn microphone on' : 'Mute microphone');
    micBtn.title = s === 'muted' ? 'Turn microphone on' : 'Mute microphone';
    $$('.bar-el').forEach(b => {
      b.className = `bar-el${(s === 'listening' || s === 'speaking') ? ' active' : ''}`;
    });
  }

  function showTranscript(text) {
    const el = $('transcript');
    if (!el) return;
    el.textContent = `"${text}"`;
    el.classList.add('visible');
  }
  function hideTranscript() { $('transcript')?.classList.remove('visible'); }

  // ── Text fallback ────────────────────────────────────────────────────────────
  function setTextMode(on) {
    textMode = on;
    $('text-row')?.classList.toggle('visible', on);
    $('kbd-btn')?.classList.toggle('active', on);
    if (on) {
      setStatus('typing');
      setTimeout(() => $('text-input')?.focus(), 60);
    }
  }

  async function sendChatText(text) {
    if (!text.trim()) return;
    showTranscript(text);
    $('pill').textContent = 'Thinking…';
    chatHistory.push({ role: 'user', content: text });
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'x-navi-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, history: chatHistory.slice(-12),
          page_url: location.href, visitor_id: visitorId,
        }),
      });
      if (!res.ok) throw new Error(`chat ${res.status}`);
      const data = await res.json();
      const reply = data.reply || '…';
      chatHistory.push({ role: 'assistant', content: reply });
      showTranscript(reply);
      $('pill').textContent = 'Type your question';
      // Navigate + highlight if the agent picked a target.
      if (data.target) {
        const el = resolveTarget(data.target);
        if (el) highlightElement(el);
      }
      playTTS(reply);
    } catch (err) {
      console.error('[Navi] chat error:', err.message);
      showTranscript('Something went wrong — please try again.');
      $('pill').textContent = 'Type your question';
    }
  }

  // Play a reply through the TTS proxy (best-effort).
  function playTTS(text) {
    fetch(`${BACKEND}/api/tts`, {
      method: 'POST',
      headers: { 'x-navi-key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
      .then(r => (r.ok ? r.blob() : Promise.reject()))
      .then(b => { new Audio(URL.createObjectURL(b)).play().catch(() => {}); })
      .catch(() => {});
  }

  // ── LiveKit SDK loader ───────────────────────────────────────────────────────
  function loadLK() {
    if (LK) return Promise.resolve();
    if (window.LivekitClient) { LK = window.LivekitClient; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js';
      s.onload  = () => { LK = window.LivekitClient; resolve(); };
      s.onerror = () => reject(new Error('LiveKit SDK failed to load'));
      document.head.appendChild(s);
    });
  }

  // ── Mic permission flow ──────────────────────────────────────────────────────
  async function ensureMicPermission() {
    if (micState === 'granted') return true;
    try {
      if (navigator.permissions?.query) {
        const st = await navigator.permissions.query({ name: 'microphone' });
        if (st.state === 'granted') { micState = 'granted'; return true; }
        if (st.state === 'denied')  { micState = 'denied';  return false; }
      }
    } catch (_) { /* permission name unsupported */ }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      stream.getTracks().forEach(t => t.stop());
      micState = 'granted';
      return true;
    } catch (_) {
      micState = 'denied';
      return false;
    }
  }

  // ── LiveKit connection ───────────────────────────────────────────────────────
  async function connect() {
    if (isConnecting || room) return;
    isConnecting = true;
    setStatus('connecting');

    // Mic permission must be granted before we burn a quota session.
    const micOk = await ensureMicPermission();
    if (!micOk) {
      // No mic → fall back to text mode instead of dead-ending.
      setStatus('denied');
      showTranscript('No microphone access — type your question instead.');
      setTextMode(true);
      isConnecting = false;
      return;
    }

    try {
      await loadLK();
      const { Room, RoomEvent, Track } = LK;
      const lang = config?.lang_auto ? detectLang() : (config?.lang || detectLang());

      const res = await fetch(`${BACKEND}/api/session/start`, {
        method: 'POST',
        headers: { 'x-navi-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, visitor_id: visitorId, page_url: location.href }),
      });

      if (res.status === 402) {
        setStatus('limit');
        showTranscript('This agent has reached its monthly session limit.');
        setTimeout(closeWidget, 4000);
        return;
      }
      if (!res.ok) throw new Error(`session/start ${res.status}`);
      const { token, wsUrl, roomName } = await res.json();

      const r = new Room({ adaptiveStream: true, dynacast: true });
      room = r;

      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind !== Track.Kind.Audio) return;
        const audioEl = track.attach();
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        audioEl.controls = false;
        audioEl.muted = false;
        audioEl.style.display = 'none';
        shadow.appendChild(audioEl);
        remoteAudioEls.push(audioEl);
        audioEl.play().catch((err) => {
          console.warn('[Navi] remote audio autoplay blocked:', err.message);
          showTranscript('Tap the microphone button to enable voice audio.');
        });
        audioEl.addEventListener('play',  () => { if (isOpen) setStatus('speaking'); });
        audioEl.addEventListener('pause', () => { if (isOpen) setStatus('listening'); });
        audioEl.addEventListener('ended', () => { if (isOpen) setStatus('listening'); });
      });
      r.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => {
          el.remove();
          remoteAudioEls = remoteAudioEls.filter(audioEl => audioEl !== el);
        });
      });

      r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (!isOpen) return;
        const remoteSpeak = speakers.some(p => !p.isLocal);
        const localSpeak  = speakers.some(p => p.isLocal);
        if (remoteSpeak)     setStatus('speaking');
        else if (localSpeak) setStatus('listening');
        else if (room)       setStatus('listening');
        else                 setStatus('idle');
      });

      r.on(RoomEvent.DataReceived, (data) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(data));
          if (msg.type === 'transcript' && msg.text) {
            showTranscript(msg.text); setTimeout(hideTranscript, 3500);
          }
          if (msg.type === 'agent_text' && msg.text) {
            showTranscript(msg.text); setTimeout(hideTranscript, 5000);
          }
          // Navigate → scroll AND contextual highlight.
          if (msg.type === 'navigate' && msg.section) {
            const target = resolveTarget(msg.section);
            if (target) setTimeout(() => highlightElement(target), 400);
          }
          // Explicit highlight directive (no scroll-to-top).
          if (msg.type === 'highlight' && msg.selector) {
            const target = resolveTarget(msg.selector);
            if (target) highlightElement(target);
          }
          if (msg.type === 'ready') sendSiteContext(r);
        } catch (_) {}
      });

      r.on(RoomEvent.Disconnected, () => {
        room = null;
        isConnecting = false;
        if (isOpen) closeWidget();
      });

      await r.connect(wsUrl, token, { autoSubscribe: true });
      await r.localParticipant.setMicrophoneEnabled(true, AUDIO_CONSTRAINTS);
      fetch(`${BACKEND}/api/voice-dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, lang }),
      }).catch(err => console.warn('[Navi] voice dispatch failed:', err.message));
      setStatus('listening');
      isConnecting = false;
      setTimeout(() => sendSiteContext(r), 1200);

    } catch (err) {
      console.error('[Navi] connect error:', err.message);
      setStatus('idle');
      room = null;
      isConnecting = false;
    }
  }

  function disconnect() {
    if (room) { try { room.disconnect(); } catch (_) {} room = null; }
    remoteAudioEls.forEach(el => el.remove());
    remoteAudioEls = [];
    isConnecting = false;
  }

  function sendSiteContext(r) {
    try {
      (r || room)?.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify({
          type: 'site_context', content: crawlSite(),
          url: location.href, lang: detectLang(),
        })),
        { reliable: true },
      );
    } catch (_) {}
  }

  // Notify agent on section scroll
  function watchSections() {
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting || !room) return;
        const id = e.target.id || e.target.getAttribute('data-section');
        if (!id) return;
        try {
          room.localParticipant?.publishData(
            new TextEncoder().encode(JSON.stringify({ type: 'section_change', section: id })),
            { reliable: true },
          );
        } catch (_) {}
      });
    }, { threshold: 0.4 });
    setTimeout(() => {
      document.querySelectorAll('section[id], [data-section]').forEach(el => obs.observe(el));
    }, 1500);
  }

  // ── Open / close ─────────────────────────────────────────────────────────────
  function openWidget() {
    if (isOpen) return;
    isOpen = true;
    $('fab')?.classList.add('hidden');
    $('bar')?.classList.add('open');
    connect();
  }
  function closeWidget() {
    isOpen = false;
    disconnect();
    setTextMode(false);
    $('fab')?.classList.remove('hidden');
    $('bar')?.classList.remove('open');
    hideTranscript();
    setStatus('idle');
    refreshConfig();
  }

  // ── Config ───────────────────────────────────────────────────────────────────
  async function fetchConfig() {
    try {
      const res = await fetch(`${BACKEND}/api/widget/config?key=${encodeURIComponent(API_KEY)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }
  function applyDisabled(disabled) {
    host.style.display = disabled ? 'none' : '';
  }
  async function refreshConfig() {
    const cfg = await fetchConfig();
    if (!cfg) return;
    config = cfg;
    applyDisabled(cfg.disabled);
  }

  // ── Install ping (dashboard "step 0" detection) ──────────────────────────────
  function sendInstallPing() {
    try {
      fetch(`${BACKEND}/api/widget/ping`, {
        method: 'POST',
        headers: { 'x-navi-key': API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: location.origin }),
        keepalive: true,
      }).catch(() => {});
    } catch (_) {}
  }

  // ── Proactive trigger ────────────────────────────────────────────────────────
  let proactiveTimer = null;
  function resetProactive() {
    clearTimeout(proactiveTimer);
    if (!isOpen && PROACTIVE_DELAY > 0) {
      proactiveTimer = setTimeout(() => { if (!isOpen) openWidget(); }, PROACTIVE_DELAY);
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  function sendText(text) {
    if (room) {
      try {
        room.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify({ type: 'ask', text })),
          { reliable: true },
        );
      } catch (_) {}
    } else {
      sendChatText(text);   // text-mode path
    }
  }
  window.Navi = {
    open: openWidget,
    close: closeWidget,
    ask: (text) => {
      if (!isOpen) { openWidget(); setTimeout(() => sendText(text), 1800); }
      else sendText(text);
    },
  };

  // ── Boot ─────────────────────────────────────────────────────────────────────
  async function boot() {
    sendInstallPing();

    config = await fetchConfig();
    if (config?.disabled) {
      console.info('[Navi] widget disabled —', config.reason);
      return;
    }

    // Proactive delay from server config (seconds → ms).
    if (config && config.proactive_delay != null) {
      PROACTIVE_DELAY = Number(config.proactive_delay) * 1000;
    } else {
      PROACTIVE_DELAY = Number(script?.getAttribute('data-proactive-delay') || 120) * 1000;
    }

    // Auto-palette — override pill tint from the host site's accent color.
    const pillOverride = config?.auto_palette ? samplePalette() : null;

    buildUI(config || { vinyl: 'midnight', voice: 'onyx', lang: 'en' }, pillOverride);

    // Wire events.
    $('fab').addEventListener('click', openWidget);
    $('close-btn').addEventListener('click', closeWidget);
    $('mic-btn').addEventListener('click', async () => {
      if (!room || !LK) {
        connect();
        return;
      }
      const { Track } = LK;
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const currentlyOn = pub ? !pub.isMuted : false;
      await room.localParticipant.setMicrophoneEnabled(!currentlyOn, AUDIO_CONSTRAINTS);
      setStatus(currentlyOn ? 'muted' : 'listening');
    });
    // Text fallback toggle + send.
    $('kbd-btn').addEventListener('click', () => setTextMode(!textMode));
    const submitText = () => {
      const inp = $('text-input');
      const v = inp.value;
      inp.value = '';
      sendChatText(v);
    };
    $('text-send').addEventListener('click', submitText);
    $('text-input').addEventListener('keydown', e => { if (e.key === 'Enter') submitText(); });

    setStatus('idle');
    watchSections();
    setTimeout(loadLK, 800);
    setTimeout(() => crawlSite(), 1200);

    if (PROACTIVE_DELAY > 0) {
      ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, resetProactive, { passive: true }));
      resetProactive();
    }

    console.info(`[Navi] Widget v3.1 loaded — key ${API_KEY.slice(0, 18)}… vinyl ${config?.vinyl || 'midnight'}`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
