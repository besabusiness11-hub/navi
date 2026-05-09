/* Navi Voice Widget v2.0 — https://navi.ai */
(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const script = document.currentScript || document.querySelector('script[data-key]');
  const API_KEY = script?.getAttribute('data-key');
  const COLOR_ID = script?.getAttribute('data-color') || 'midnight';
  const BACKEND = (script?.getAttribute('data-backend') || 'https://api.navi.ai').replace(/\/$/, '');

  if (!API_KEY) {
    console.warn('[Navi] No data-key found on script tag. Widget not loaded.');
    return;
  }

  // ── Color map ───────────────────────────────────────────────────────────────
  const COLORS = {
    midnight: { pill: '#a6b1b6', icon: '/vinile-finale.png'     },
    crystal:  { pill: '#c0d0da', icon: '/vinile-trasparente.png'},
    amber:    { pill: '#c89060', icon: '/vinile-arancione.png'  },
    crimson:  { pill: '#b06060', icon: '/vinile-rosso.png'      },
    forest:   { pill: '#608060', icon: '/vinile-verde.png'      },
    violet:   { pill: '#8060b0', icon: '/vinile-viola.png'      },
  };
  const VINYL_SRC  = (COLORS[COLOR_ID] ?? COLORS.midnight).icon;
  const PILL_COLOR = (COLORS[COLOR_ID] ?? COLORS.midnight).pill;
  const CDN = BACKEND;

  // ── State ───────────────────────────────────────────────────────────────────
  let isOpen = false;
  let room   = null;
  let LK     = null; // LivekitClient once loaded
  let visitorId = localStorage.getItem('_navi_vid') || Math.random().toString(36).slice(2);
  localStorage.setItem('_navi_vid', visitorId);
  let _siteContextCache = null; // crawled once, reused

  // ── Language detection ───────────────────────────────────────────────────────
  function detectLang() {
    const pageLang = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    const metaLang = document.querySelector('meta[http-equiv="content-language"]')?.content?.slice(0, 2).toLowerCase();
    const browserLang = (navigator.language || navigator.userLanguage || 'en').slice(0, 2).toLowerCase();
    return pageLang || metaLang || browserLang || 'en';
  }

  // ── DOM site crawler ─────────────────────────────────────────────────────────
  // Runs client-side: extracts visible text from sections, headings, pricing, FAQs.
  // Sends to agent as supplemental real-time context on top of server-side crawl.
  function crawlSite() {
    if (_siteContextCache) return _siteContextCache;

    const out = {
      url:   location.href,
      title: document.title,
      lang:  detectLang(),
      meta: {
        description: document.querySelector('meta[name="description"]')?.content || '',
        ogTitle:     document.querySelector('meta[property="og:title"]')?.content || '',
        ogDesc:      document.querySelector('meta[property="og:description"]')?.content || '',
      },
      nav:      [],
      sections: [],
      pricing:  [],
      faqs:     [],
    };

    // Nav links
    document.querySelectorAll('nav a, header a, [role="navigation"] a').forEach(a => {
      const text = a.textContent.trim();
      const href = a.getAttribute('href') || '';
      if (text && href && text.length < 60) out.nav.push(`${text} → ${href}`);
    });

    // Main content sections
    const seen = new Set();
    document.querySelectorAll('section, article, main > div, [id], .section').forEach(el => {
      const raw = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (raw.length < 40 || seen.has(raw.slice(0, 60))) return;
      seen.add(raw.slice(0, 60));

      const heading = el.querySelector('h1,h2,h3,h4')?.textContent?.trim() || '';
      out.sections.push({
        id:      el.id || '',
        heading,
        text:    raw.slice(0, 600),
      });
    });

    // Pricing blocks
    document.querySelectorAll('[class*="pric"],[class*="plan"],[id*="pric"],[id*="plan"]').forEach(el => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (t.length > 30) out.pricing.push(t);
    });

    // FAQs / accordions
    document.querySelectorAll('details, [class*="faq"], [class*="accord"]').forEach(el => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (t.length > 20) out.faqs.push(t);
    });

    // Cap total size to ~6KB for LLM context
    const json = JSON.stringify(out);
    _siteContextCache = json.length > 6000 ? json.slice(0, 6000) + '…}' : json;
    return _siteContextCache;
  }

  // Pre-crawl silently after page settles (so it's ready when user opens widget)
  if (document.readyState === 'complete') setTimeout(() => crawlSite(), 1200);
  else window.addEventListener('load', () => setTimeout(() => crawlSite(), 1200));

  // ── CSS ─────────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #navi-widget * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #navi-fab {
      position: fixed; bottom: 28px; right: 28px; z-index: 2147483646;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: transform .25s cubic-bezier(.16,1,.3,1);
    }
    #navi-fab:hover { transform: scale(1.06) rotate(8deg); }
    #navi-fab img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover;
      box-shadow: 0 4px 24px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.12); }
    #navi-bar {
      position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; display: flex; flex-direction: column; align-items: center; gap: 8px;
      opacity: 0; pointer-events: none; transition: opacity .3s, transform .3s;
      transform: translateX(-50%) translateY(16px);
    }
    #navi-bar.open { opacity: 1; pointer-events: auto; transform: translateX(-50%) translateY(0); }
    #navi-fab.hidden { opacity: 0; pointer-events: none; }
    #navi-transcript {
      background: rgba(0,0,0,0.82); backdrop-filter: blur(12px);
      padding: 8px 14px; border-radius: 10px; max-width: 280px;
      color: rgba(255,255,255,0.85); font-size: 12px; font-style: italic;
      border: 1px solid rgba(255,255,255,0.1); text-align: center;
      opacity: 0; transition: opacity .2s;
    }
    #navi-transcript.visible { opacity: 1; }
    #navi-pill-status {
      padding: 5px 14px; border-radius: 100px; font-size: 11px; font-weight: 500;
      color: #1a1a1a; background: VAR_PILL; cursor: default; transition: background .2s;
    }
    #navi-controls {
      display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 100px;
      background: VAR_PILL; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    #navi-vinyl-btn {
      width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
      border: none; cursor: pointer; padding: 0;
    }
    #navi-vinyl-btn img { width: 100%; height: 100%; object-fit: cover; }
    #navi-name-wrap { display: flex; flex-direction: column; min-width: 60px; padding: 0 4px; }
    #navi-name { color: #1a1a1a; font-size: 12px; font-weight: 700; line-height: 1.2; }
    #navi-status-text { color: #555; font-size: 10px; font-weight: 500; line-height: 1.2; transition: color .2s; }
    #navi-status-text.listening { color: #5ea236; }
    #navi-wave { display: flex; align-items: center; gap: 2px; height: 20px; margin: 0 8px; }
    .navi-bar-el { width: 3px; border-radius: 2px; background: #4a5559; transition: background .2s; animation: none; }
    .navi-bar-el.active { background: #5ea236; animation: navi-pulse .7s ease-in-out infinite; }
    .navi-bar-el:nth-child(2) { animation-delay: .1s; }
    .navi-bar-el:nth-child(3) { animation-delay: .2s; }
    .navi-bar-el:nth-child(4) { animation-delay: .3s; }
    @keyframes navi-pulse { 0%,100% { height: 4px; } 50% { height: 16px; } }
    #navi-mic-btn {
      width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: #8c9ba1; transition: background .2s; flex-shrink: 0;
    }
    #navi-mic-btn.listening { background: #5ea236; }
    #navi-mic-btn.speaking  { background: #e8a020; }
    #navi-mic-btn.muted     { background: #cc3333; }
    #navi-mic-btn svg { width: 16px; height: 16px; stroke: white; }
    #navi-close-btn {
      width: 40px; height: 40px; border-radius: 50%; border: none; cursor: pointer;
      background: #ff5252; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #navi-close-btn svg { width: 16px; height: 16px; stroke: white; stroke-width: 2; }
    @media (max-width: 500px) {
      #navi-fab { right: 16px; bottom: 16px; }
      #navi-bar { bottom: 16px; width: calc(100vw - 32px); }
      #navi-controls { width: 100%; justify-content: space-between; }
    }
  `.replace(/VAR_PILL/g, PILL_COLOR);
  document.head.appendChild(style);

  // ── DOM ─────────────────────────────────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'navi-widget';
  root.innerHTML = `
    <div id="navi-fab">
      <img src="${CDN}${VINYL_SRC}" alt="Navi" />
    </div>
    <div id="navi-bar">
      <div id="navi-transcript"></div>
      <div id="navi-pill-status">Connecting…</div>
      <div id="navi-controls">
        <button id="navi-vinyl-btn"><img src="${CDN}${VINYL_SRC}" alt="Navi" /></button>
        <div id="navi-name-wrap">
          <span id="navi-name">Navi</span>
          <span id="navi-status-text">Active</span>
        </div>
        <div id="navi-wave">
          <div class="navi-bar-el"></div>
          <div class="navi-bar-el"></div>
          <div class="navi-bar-el"></div>
          <div class="navi-bar-el"></div>
        </div>
        <button id="navi-mic-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3"/>
            <path d="M5 10a7 7 0 0 0 14 0"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="9" y1="22" x2="15" y2="22"/>
          </svg>
        </button>
        <button id="navi-close-btn">
          <svg viewBox="0 0 24 24" fill="none">
            <line x1="18" y1="6" x2="6" y2="18" stroke-linecap="round"/>
            <line x1="6" y1="6" x2="18" y2="18" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const fab          = document.getElementById('navi-fab');
  const bar          = document.getElementById('navi-bar');
  const transcriptEl = document.getElementById('navi-transcript');
  const statusPill   = document.getElementById('navi-pill-status');
  const statusText   = document.getElementById('navi-status-text');
  const micBtn       = document.getElementById('navi-mic-btn');
  const closeBtn     = document.getElementById('navi-close-btn');
  const waveBars     = document.querySelectorAll('.navi-bar-el');

  // ── UI helpers ──────────────────────────────────────────────────────────────
  function setStatus(s) {
    const labels = { connecting: 'Connecting…', listening: 'Listening…', speaking: 'Speaking', idle: 'Live Session', muted: 'Muted' };
    statusPill.textContent = labels[s] ?? 'Live Session';
    statusText.textContent = s === 'listening' ? 'Listening…' : s === 'speaking' ? 'Speaking' : s === 'connecting' ? 'Connecting…' : 'Active';
    statusText.className = s === 'listening' ? 'listening' : '';
    micBtn.className = 'navi-mic-btn-reset';
    micBtn.id = 'navi-mic-btn';
    if (s === 'listening') micBtn.classList.add('listening');
    else if (s === 'speaking') micBtn.classList.add('speaking');
    else if (s === 'muted') micBtn.classList.add('muted');
    waveBars.forEach(b => { b.className = `navi-bar-el${(s === 'listening' || s === 'speaking') ? ' active' : ''}`; });
  }

  function showTranscript(text) {
    transcriptEl.textContent = `"${text}"`;
    transcriptEl.classList.add('visible');
  }

  function hideTranscript() {
    transcriptEl.classList.remove('visible');
  }

  // ── LiveKit SDK loader ───────────────────────────────────────────────────────
  function loadLK() {
    if (LK) return Promise.resolve();
    if (window.LivekitClient) { LK = window.LivekitClient; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/livekit-client@2/dist/livekit-client.umd.min.js';
      s.onload = () => { LK = window.LivekitClient; resolve(); };
      s.onerror = () => reject(new Error('LiveKit SDK failed to load'));
      document.head.appendChild(s);
    });
  }

  // Pre-load SDK silently after page settles
  if (document.readyState === 'complete') setTimeout(loadLK, 800);
  else window.addEventListener('load', () => setTimeout(loadLK, 800));

  // ── LiveKit connection ───────────────────────────────────────────────────────
  async function connect() {
    setStatus('connecting');
    try {
      await loadLK();
      const { Room, RoomEvent, Track } = LK;

      const lang = detectLang();
      const res = await fetch(
        `${BACKEND}/api/voice-token?lang=${lang}&visitor_id=${encodeURIComponent(visitorId)}`,
        { headers: { 'x-navi-key': API_KEY } },
      );
      if (!res.ok) throw new Error(`token ${res.status}`);
      const { token, wsUrl } = await res.json();

      const r = new Room({ adaptiveStream: true, dynacast: true });
      room = r;

      // Agent audio → attach + track UI state
      r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const audioEl = track.attach();
        audioEl.addEventListener('play',  () => { if (isOpen) setStatus('speaking'); });
        audioEl.addEventListener('pause', () => { if (isOpen) setStatus('listening'); });
        audioEl.addEventListener('ended', () => { if (isOpen) setStatus('listening'); });
      });

      r.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach(); });

      // Active speakers → UI
      r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        if (!isOpen) return;
        const remoteSpeak = speakers.some(p => !p.isLocal);
        const localSpeak  = speakers.some(p => p.isLocal);
        if (remoteSpeak)      setStatus('speaking');
        else if (localSpeak)  setStatus('listening');
        else                  setStatus('idle');
      });

      // Data messages from agent
      r.on(RoomEvent.DataReceived, (data) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(data));

          if (msg.type === 'transcript' && msg.text) {
            showTranscript(msg.text);
            setTimeout(hideTranscript, 3500);
          }

          if (msg.type === 'agent_text' && msg.text) {
            // Show what agent is saying as subtitle
            showTranscript(msg.text);
            setTimeout(hideTranscript, 5000);
          }

          if (msg.type === 'navigate' && msg.section) {
            // Agent instructed page navigation — scroll to section
            const target = document.getElementById(msg.section)
              || document.querySelector(`[data-section="${msg.section}"]`)
              || document.querySelector(`.${msg.section}`);
            if (target) {
              setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
            }
          }

          if (msg.type === 'ready') {
            // Agent is ready — send site context
            sendSiteContext(r);
          }
        } catch (_) {}
      });

      r.on(RoomEvent.Disconnected, () => {
        room = null;
        if (isOpen) closeWidget();
      });

      await r.connect(wsUrl, token, { autoSubscribe: true });
      await r.localParticipant.setMicrophoneEnabled(true);
      setStatus('listening');

      // Send site context immediately — agent may already be waiting
      setTimeout(() => sendSiteContext(r), 1200);

    } catch (err) {
      console.error('[Navi] connect error:', err.message);
      setStatus('idle');
      room = null;
    }
  }

  function disconnect() {
    if (room) { try { room.disconnect(); } catch (_) {} room = null; }
  }

  function sendSiteContext(r) {
    try {
      const content = crawlSite();
      (r || room)?.localParticipant?.publishData(
        new TextEncoder().encode(JSON.stringify({
          type:    'site_context',
          content,
          url:     location.href,
          lang:    detectLang(),
        })),
        { reliable: true },
      );
    } catch (_) {}
  }

  // Notify agent when visitor scrolls to a new section (intersection observer)
  (function watchSections() {
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
    // Observe after DOM settles
    setTimeout(() => {
      document.querySelectorAll('section[id], [data-section]').forEach(el => obs.observe(el));
    }, 1500);
  })();

  // ── Widget open / close ──────────────────────────────────────────────────────
  function openWidget() {
    isOpen = true;
    fab.classList.add('hidden');
    bar.classList.add('open');
    connect();
  }

  function closeWidget() {
    isOpen = false;
    disconnect();
    fab.classList.remove('hidden');
    bar.classList.remove('open');
    hideTranscript();
    setStatus('idle');
  }

  // ── Mic mute toggle ──────────────────────────────────────────────────────────
  micBtn.addEventListener('click', () => {
    if (!room || !LK) return;
    const { Track } = LK;
    const pub = room.localParticipant.getTrackPublication(Track.Kind.Audio);
    if (!pub) return;
    const nowMuted = pub.isMuted;
    room.localParticipant.setMicrophoneEnabled(!!nowMuted); // toggle
    setStatus(nowMuted ? 'listening' : 'muted');
  });

  // ── Proactive trigger ────────────────────────────────────────────────────────
  let proactiveTimer = null;
  const PROACTIVE_DELAY = Number(script?.getAttribute('data-proactive-delay') || 120) * 1000;

  function resetProactive() {
    clearTimeout(proactiveTimer);
    if (!isOpen && PROACTIVE_DELAY > 0) {
      proactiveTimer = setTimeout(() => { if (!isOpen) openWidget(); }, PROACTIVE_DELAY);
    }
  }

  if (PROACTIVE_DELAY > 0) {
    ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'].forEach(ev =>
      document.addEventListener(ev, resetProactive, { passive: true }));
    resetProactive();
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  fab.addEventListener('click', openWidget);
  closeBtn.addEventListener('click', closeWidget);

  // ── Public API ───────────────────────────────────────────────────────────────
  function sendText(text) {
    if (!room) return;
    try {
      room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify({ type: 'ask', text })),
        { reliable: true },
      );
    } catch (_) {}
  }

  window.Navi = {
    open:  openWidget,
    close: closeWidget,
    ask:   (text) => {
      if (!isOpen) { openWidget(); setTimeout(() => sendText(text), 1800); }
      else sendText(text);
    },
  };

  console.info(`[Navi] Widget v2 loaded — key: ${API_KEY.slice(0, 18)}… color: ${COLOR_ID} (LiveKit)`);
})();
