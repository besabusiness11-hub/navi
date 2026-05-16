import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Persistence ───────────────────────────────────────────────────────────────
const STORAGE_KEY = 'navi_dashboard_v1';
const loadAll = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; } catch { return {}; } };
const persist = (patch) => { const s = loadAll(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, ...patch })); };
const useStored = (key, def) => {
  const [v, setV] = useState(() => loadAll()[key] ?? def);
  const set = (val) => { setV(val); persist({ [key]: val }); };
  return [v, set];
};

// ── Plans ─────────────────────────────────────────────────────────────────────
const PLANS = {
  free: {
    label: 'Free', price: '€0', color: '#606060',
    sessionMax: 50, sessionUnit: '/mo',
    agents: 1, pages: 50, lang: '1',
    f: { analytics: false, widget: false, leads: false, plugins: false, watermark: true, whitelabel: false, multisite: false, packs: false },
  },
  starter: {
    label: 'Starter', price: '€49/mo', color: '#4a7fff',
    sessionMax: 200, sessionUnit: '/mo',
    agents: 1, pages: 500, lang: '30+',
    f: { analytics: true, widget: true, leads: true, plugins: false, watermark: false, whitelabel: false, multisite: false, packs: false },
  },
  business: {
    label: 'Business', price: '€99/mo', color: '#3dc45a',
    sessionMax: 600, sessionUnit: '/mo',
    agents: 3, pages: 2000, lang: '30+',
    f: { analytics: true, widget: true, leads: true, plugins: true, watermark: false, whitelabel: false, multisite: true, packs: false },
  },
  agency: {
    label: 'Agency', price: '€199/mo', color: '#c47dff',
    sessionMax: 1500, sessionUnit: '/mo',
    agents: 10, pages: 10000, lang: '30+',
    f: { analytics: true, widget: true, leads: true, plugins: true, watermark: false, whitelabel: true, multisite: true, packs: true },
  },
};

// ── Vinyl options (images already in /public) ─────────────────────────────────
const VINYLS = [
  { src: '/vinile-finale.png',      id: 'midnight', label: 'Midnight' },
  { src: '/vinile-trasparente.png', id: 'crystal',  label: 'Crystal'  },
  { src: '/vinile-arancione.png',   id: 'amber',    label: 'Amber'    },
  { src: '/vinile-rosso.png',       id: 'crimson',  label: 'Crimson'  },
  { src: '/vinile-verde.png',       id: 'forest',   label: 'Forest'   },
  { src: '/vinile-viola.png',       id: 'violet',   label: 'Violet'   },
];

const PAGES_DATA = [
  { url: '/pricing',    visits: 342,  q: 89,  priority: 'high',   intent: 'Convert'   },
  { url: '/',           visits: 1204, q: 156, priority: 'medium', intent: 'Awareness' },
  { url: '/product',    visits: 876,  q: 203, priority: 'medium', intent: 'Educate'   },
  { url: '/demo',       visits: 445,  q: 67,  priority: 'low',    intent: 'Demo'      },
  { url: '/howitworks', visits: 298,  q: 44,  priority: 'low',    intent: 'Educate'   },
];

const PLATFORMS = [
  { id: 'shopify',     label: 'Shopify',      s: 'available' },
  { id: 'wordpress',   label: 'WordPress',    s: 'available' },
  { id: 'webflow',     label: 'Webflow',      s: 'available' },
  { id: 'wix',         label: 'Wix',          s: 'beta'      },
  { id: 'squarespace', label: 'Squarespace',  s: 'beta'      },
  { id: 'framer',      label: 'Framer',       s: 'coming'    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';
const vinylById = (id) => VINYLS.find(v => v.id === id) ?? VINYLS[0];

const buildWeekData = (weekArr) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const label = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    const found = (weekArr ?? []).find(w => w.day === day);
    days.push({ day, label, count: found?.count ?? 0 });
  }
  return days;
};

// ── Frequency ring (same as landing) ─────────────────────────────────────────
const FreqRing = ({ size = 110, count = 20 }) => {
  const pad = 18; const svgSize = size + pad * 2; const cx = svgSize / 2; const cy = svgSize / 2; const r = size / 2 + 5;
  return (
    <svg className="absolute pointer-events-none" width={svgSize} height={svgSize}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 0 }}>
      {[...Array(count)].map((_, i) => {
        const angle = (i * 360 / count - 90) * Math.PI / 180;
        const x1 = cx + r * Math.cos(angle); const y1 = cy + r * Math.sin(angle);
        const minLen = 3; const maxLen = 4 + (i % 5) * 2.5;
        const x2min = cx + (r + minLen) * Math.cos(angle); const y2min = cy + (r + minLen) * Math.sin(angle);
        const x2max = cx + (r + maxLen) * Math.cos(angle); const y2max = cy + (r + maxLen) * Math.sin(angle);
        return (
          <motion.line key={i} x1={x1} y1={y1} x2={x2min} y2={y2min}
            stroke="rgba(88,196,236,0.55)" strokeWidth={1.8} strokeLinecap="round"
            animate={{ x2: [x2min, x2max, x2min], y2: [y2min, y2max, y2min], opacity: [0.2, 0.8, 0.2] }}
            transition={{ duration: 0.42 + (i % 6) * 0.09, delay: i / count * 1.1, repeat: Infinity, ease: 'easeInOut' }} />
        );
      })}
    </svg>
  );
};

// ── Shared UI ─────────────────────────────────────────────────────────────────
const Card = ({ children, className = '', style = {} }) => (
  <div className={`relative rounded-2xl ${className}`}
    style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', ...style }}>
    {children}
  </div>
);

const Tag = ({ children }) => (
  <span className="text-[9px] font-mono tracking-[0.22em] uppercase text-white/30 block mb-2">{children}</span>
);

const LockOverlay = ({ req = 'Agency' }) => (
  <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center z-10"
    style={{ background: 'rgba(6,6,10,0.88)', backdropFilter: 'blur(8px)' }}>
    <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
        <rect x="1" y="6" width="12" height="9" rx="2" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" />
        <path d="M3 6V4.5A4 4 0 0 1 11 4.5V6" stroke="rgba(255,255,255,0.35)" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="10.5" r="1.2" fill="rgba(255,255,255,0.35)" />
      </svg>
    </div>
    <p className="text-[10px] font-mono text-white/30 mb-3">Requires {req}</p>
    <a href={`?plan=${req.toLowerCase()}`} className="text-[10px] font-mono px-4 py-1.5 rounded-full transition-all"
      style={{ background: 'rgba(74,127,255,0.15)', border: '1px solid rgba(74,127,255,0.3)', color: 'rgba(130,180,255,0.9)' }}>
      Upgrade →
    </a>
  </div>
);

const Toggle = ({ value, onChange, disabled = false }) => (
  <button onClick={() => !disabled && onChange(!value)}
    className={`relative rounded-full flex-shrink-0 ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    style={{ width: 40, height: 22, background: value ? '#3dc45a' : 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.08)', transition: 'background 0.2s' }}>
    <motion.div className="absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm"
      animate={{ left: value ? 20 : 4 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
  </button>
);

// ── Widget preview (mini) ─────────────────────────────────────────────────────
const WidgetPreview = ({ vinyl, agentOn }) => {
  const [pulse, setPulse] = useState(0);
  useEffect(() => { if (!agentOn) return; const id = setInterval(() => setPulse(p => (p + 1) % 3), 1400); return () => clearInterval(id); }, [agentOn]);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="px-3 py-1.5 rounded-full text-[10px] font-sans font-medium text-[#1a1a1a]"
        style={{ background: agentOn ? '#a6b1b6' : 'rgba(255,255,255,0.15)', color: agentOn ? '#1a1a1a' : 'rgba(255,255,255,0.4)' }}>
        {agentOn ? ['Live Session', 'Listening…', 'Speaking'][pulse] : 'Paused'}
      </div>
      <div className="flex items-center gap-2.5 p-1.5 pr-3 rounded-full shadow-xl"
        style={{ background: agentOn ? '#a6b1b6' : 'rgba(255,255,255,0.1)' }}>
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
          <img src={vinyl.src} alt="Navi" className="w-full h-full object-cover" />
        </div>
        <div className="flex flex-col min-w-[60px]">
          <span className="text-[11px] font-bold" style={{ color: agentOn ? '#1a1a1a' : 'rgba(255,255,255,0.5)' }}>Navi</span>
          <span className="text-[9px] font-medium" style={{ color: agentOn ? (pulse === 1 ? '#5ea236' : '#555') : 'rgba(255,255,255,0.3)' }}>
            {agentOn ? ['Active', 'Listening…', 'Speaking'][pulse] : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-[3px] mx-2 h-5">
          {[...Array(4)].map((_, i) => (
            <motion.div key={i}
              style={{ width: 4, minHeight: 3, maxHeight: 20, borderRadius: 2, background: agentOn && pulse === 1 ? '#5ea236' : agentOn ? '#4a5559' : 'rgba(255,255,255,0.2)' }}
              animate={agentOn ? { height: ['20%', '100%', '20%'] } : { height: '20%' }}
              transition={{ duration: 0.7, repeat: agentOn ? Infinity : 0, delay: i * 0.1, ease: 'easeInOut' }} />
          ))}
        </div>
        <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: agentOn ? (pulse === 1 ? '#5ea236' : '#8c9ba1') : 'rgba(255,255,255,0.08)' }}>
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="11" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="9" y1="22" x2="15" y2="22" />
          </svg>
        </div>
      </div>
    </div>
  );
};

// ── Loading / Error screens ───────────────────────────────────────────────────
const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center font-sans" style={{ background: '#06060a' }}>
    <div className="flex flex-col items-center gap-4">
      <motion.img src="/vinile-finale.png" alt="Navi" className="w-14 h-14 rounded-full object-cover"
        animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
      <p className="text-[11px] font-mono text-white/30 tracking-widest">Loading dashboard…</p>
    </div>
  </div>
);

const ErrorScreen = ({ message }) => (
  <div className="min-h-screen flex items-center justify-center font-sans" style={{ background: '#06060a' }}>
    <div className="text-center max-w-sm px-6">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
        style={{ background: 'rgba(255,95,87,0.1)', border: '1px solid rgba(255,95,87,0.3)' }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <circle cx="9" cy="9" r="8" stroke="#ff5f57" strokeWidth="1.5" />
          <line x1="9" y1="5" x2="9" y2="10" stroke="#ff5f57" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="9" cy="13" r="1" fill="#ff5f57" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-white mb-2">Dashboard access failed</p>
      <p className="text-[11px] font-mono text-white/35 mb-5">{message}</p>
      <a href="/" className="text-[11px] font-mono text-white/25 hover:text-white/50 transition-colors">← Back to site</a>
    </div>
  </div>
);

// ── PAGES ─────────────────────────────────────────────────────────────────────

// Step 0 — detects whether widget.js has pinged in from the live site.
const WidgetDetector = ({ authHeader }) => {
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);

  const check = () => {
    setChecking(true);
    fetch(`${BACKEND}/api/widget/status`, { headers: authHeader })
      .then(r => (r.ok ? r.json() : null))
      .then(s => { setStatus(s); setChecking(false); })
      .catch(() => setChecking(false));
  };

  useEffect(() => {
    check();
    // Poll until detected, then stop.
    const id = setInterval(() => {
      setStatus(prev => {
        if (prev?.installed) { clearInterval(id); return prev; }
        check();
        return prev;
      });
    }, 8000);
    return () => clearInterval(id);
  }, []);  

  const installed = status?.installed;
  const ago = (() => {
    if (!status?.last_seen) return '';
    const s = Math.floor(Date.now() / 1000 - status.last_seen);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  })();

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <Tag>Step 0 — Widget detection</Tag>
        <button onClick={check}
          className="text-[9px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-md transition-all"
          style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)' }}>
          {checking ? 'Checking…' : 'Re-check'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <motion.div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: installed ? '#3dc45a' : '#febc2e' }}
          animate={installed ? { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 2, repeat: Infinity }} />
        <span className="text-[13px] text-white/70">
          {installed
            ? <>✓ Live on <span className="text-white font-medium">{status.site_url || 'your site'}</span></>
            : 'Not detected yet — paste the snippet before </body> and open your site once.'}
        </span>
      </div>
      {installed && ago && (
        <p className="text-[10px] font-mono text-white/25 mt-2">Last ping {ago}</p>
      )}
    </Card>
  );
};

// Overview
const OverviewPage = ({ plan, agentOn, setAgentOn, apiKey, minuteUsed, analytics, recent, authHeader, user }) => {
  const [copied, setCopied] = useState(false);

  // Script tag is the only install method — widget config is server-driven.
  const embedCode = `<script src="${BACKEND}/widget.js" data-key="${apiKey}" defer></script>`;

  const copy = () => navigator.clipboard.writeText(embedCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200); });

  return (
    <div className="space-y-5">
      {/* Embed code hero */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <Tag>Your install code</Tag>
            <h2 className="text-lg font-semibold text-white leading-tight">One line. Any site.</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <motion.div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: agentOn ? '#3dc45a' : '#606060' }}
                animate={agentOn ? { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }} />
              <span className="text-[10px] font-mono text-white/40">{agentOn ? 'Live' : 'Paused'}</span>
            </div>
            <Toggle value={agentOn} onChange={setAgentOn} />
          </div>
        </div>

        {/* Code block — paste before </body> */}
        <p className="text-[10px] font-mono text-white/30 mb-2">Paste before &lt;/body&gt; on your site</p>
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl mb-4"
          style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-white/15 font-mono text-xs select-none flex-shrink-0">$</span>
          <code className="font-mono text-[11px] text-white/60 flex-1 min-w-0 break-all leading-relaxed">
            <span style={{ color: '#7db3ff' }}>{'<script'}</span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}> src=</span>
            <span style={{ color: '#7dde8a' }}>"{BACKEND}/widget.js"</span>
            <br />
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>{'  '}data-key=</span>
            <span style={{ color: '#7dde8a' }}>"{apiKey}"</span>
            <span style={{ color: '#7db3ff' }}> defer{'></script>'}</span>
          </code>
          <motion.button onClick={copy} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase tracking-widest border transition-all"
            style={{ background: copied ? 'rgba(61,196,90,0.15)' : 'rgba(255,255,255,0.05)', borderColor: copied ? 'rgba(61,196,90,0.4)' : 'rgba(255,255,255,0.08)', color: copied ? '#3dc45a' : 'rgba(255,255,255,0.4)' }}>
            {copied ? '✓ Copied' : 'Copy'}
          </motion.button>
        </div>

        {/* API key row */}
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl mb-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <span className="text-[9px] font-mono text-white/20 flex-shrink-0">KEY</span>
          <code className="text-[10px] font-mono text-white/35 flex-1 truncate">{apiKey}</code>
          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: 'rgba(61,196,90,0.1)', color: '#3dc45a' }}>live</span>
        </div>

        {/* Session quota */}
        {(() => {
          const q = user?.quota ?? { used: minuteUsed ?? 0, limit: plan.sessionMax, bonus: 0, remaining: plan.sessionMax };
          const qpct = Math.min(100, Math.round((q.used / Math.max(q.limit, 1)) * 100));
          return (
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-[9px] font-mono text-white/25">
                  {q.used.toLocaleString()} / {q.limit.toLocaleString()} sessions
                  {q.bonus > 0 && <span style={{ color: '#3dc45a' }}> +{q.bonus} bonus</span>}
                </span>
                <span className="text-[9px] font-mono text-white/25">{qpct}%</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <motion.div className="h-full rounded-full"
                  initial={{ width: 0 }} animate={{ width: `${qpct}%` }}
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  style={{ background: qpct > 80 ? '#ff5f57' : qpct > 60 ? '#febc2e' : '#3dc45a' }} />
              </div>
              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[9px] font-mono text-white/25">{q.remaining.toLocaleString()} sessions left this cycle</span>
                <PackBuyButton authHeader={authHeader} />
              </div>
            </div>
          );
        })()}

        {plan.f.watermark && (
          <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(254,188,46,0.06)', border: '1px solid rgba(254,188,46,0.15)' }}>
            <span style={{ color: '#febc2e' }}>⚠</span>
            <p className="text-[10px] font-mono text-white/40">
              Watermark enabled on Free plan.{' '}
              <a href="?plan=starter" style={{ color: 'rgba(130,180,255,0.8)' }}>Remove with Starter →</a>
            </p>
          </div>
        )}
      </Card>

      {/* Step 0 — widget detection */}
      <WidgetDetector authHeader={authHeader} />

      {/* Knowledge base — re-crawl */}
      <KBCard user={user} authHeader={authHeader} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Today', value: String(analytics?.today ?? '—'), sub: 'conversations' },
          { label: 'This week', value: String(analytics?.leads ?? '—'), sub: 'leads captured', accent: '#3dc45a' },
          { label: 'Indexed', value: plan.pages.toString(), sub: 'pages', accent: '#4a7fff' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <Tag>{s.label}</Tag>
            <div className="text-2xl font-light mt-1" style={{ color: s.accent ?? 'white' }}>{s.value}</div>
            <div className="text-[10px] font-mono text-white/25 mt-0.5">{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* Recent */}
      <Card className="p-5">
        <Tag>Recent conversations</Tag>
        <div className="mt-2 space-y-1">
          {(recent ?? []).length === 0 ? (
            <p className="text-[11px] font-mono text-white/20 py-4 text-center">No conversations yet. Install the widget to get started.</p>
          ) : (recent ?? []).map(c => {
            const label = c.visitor_id ? `Visitor ${c.visitor_id.slice(0, 6)}` : 'Visitor';
            const ago = (() => { const s = Math.floor((Date.now() / 1000) - c.created_at); if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s/60)}m`; if (s < 86400) return `${Math.floor(s/3600)}h`; return `${Math.floor(s/86400)}d`; })();
            return (
              <div key={c.id} className="flex items-start gap-3 py-2.5 border-b last:border-0"
                style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-mono"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' }}>
                  V
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium text-white/65">{label}</span>
                    <span className="text-[9px] font-mono text-white/20">{ago} ago</span>
                    <span className="text-[9px] font-mono text-white/15 ml-auto">{c.page_url}</span>
                    {!!c.is_lead && <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(61,196,90,0.1)', color: '#3dc45a' }}>lead</span>}
                  </div>
                  <p className="text-[10px] text-white/35 mt-0.5 truncate">"{c.message}"</p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

// Customize
const CustomizePage = ({ plan, planKey, vinyl, setVinyl, agentOn, user, patchMe, authHeader }) => {
  const [proactive, setProactive] = useStored('proactive', true);
  const [proactiveDelay, setProactiveDelay] = useStored('proactiveDelay', 120);
  const [sessionMem, setSessionMem] = useStored('sessionMem', true);
  const [textFallback, setTextFallback] = useStored('textFallback', true);
  const [multiPage, setMultiPage] = useStored('multiPage', true);
  const [highlight, setHighlight] = useStored('highlight', true);
  const [autoPalette, setAutoPalette] = useStored('autoPalette', false);
  const [position, setPosition] = useStored('position', 'bottom-right');
  const [fallbackEmail, setFallbackEmail] = useStored('fallbackEmail', '');
  const [faqUrl, setFaqUrl] = useStored('faqUrl', '/faq');
  const [pages, setPages] = useStored('pages', PAGES_DATA);

  const locked = !plan.f.widget;

  return (
    <div className="space-y-5">
      {/* Vinyl picker HERO */}
      <div className="relative">
        <Card className="p-6">
          <Tag>Vinyl color</Tag>
          <p className="text-[11px] text-white/35 mb-6">Reflected in your embed code automatically. Change anytime — live update.</p>

          <div className="flex flex-col items-center gap-5">
            {/* Big vinyl display */}
            <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 220, height: 220 }}>
              <div className="absolute inset-0 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, rgba(88,196,236,0.15) 0%, transparent 70%)', filter: 'blur(20px)' }} />
              {agentOn && <FreqRing size={200} count={22} />}
              <motion.img
                key={vinyl.src}
                src={vinyl.src}
                alt={vinyl.label}
                className="absolute rounded-full object-contain select-none"
                style={{ width: 200, height: 200, filter: 'drop-shadow(0 0 28px rgba(88,196,236,0.3))' }}
                initial={{ opacity: 0, scale: 0.88, filter: 'blur(10px) drop-shadow(0 0 0px rgba(88,196,236,0))' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px) drop-shadow(0 0 28px rgba(88,196,236,0.3))' }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            {/* Color name */}
            <p className="text-[11px] font-mono text-white/50 tracking-widest uppercase">{vinyl.label}</p>

            {/* Swatches */}
            <div className="flex gap-3 flex-wrap justify-center">
              {VINYLS.map(v => (
                <motion.button key={v.id} onClick={() => !locked && setVinyl(v)}
                  whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}
                  className={`rounded-full overflow-hidden flex-shrink-0 transition-all ${locked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                  style={{
                    width: 36, height: 36,
                    border: vinyl.id === v.id ? '2.5px solid rgba(88,196,236,0.9)' : '2px solid rgba(255,255,255,0.12)',
                    boxShadow: vinyl.id === v.id ? '0 0 12px rgba(88,196,236,0.45)' : 'none',
                  }}>
                  <img src={v.src} alt={v.label} className="w-full h-full object-cover" draggable={false} />
                </motion.button>
              ))}
            </div>
          </div>
        </Card>
        {locked && <LockOverlay req="Starter" />}
      </div>

      {/* Live widget preview */}
      <Card className="p-5">
        <Tag>Widget preview</Tag>
        <p className="text-[10px] text-white/30 mb-5">Live — updates as you change color above</p>
        <div className="flex justify-center">
          <WidgetPreview vinyl={vinyl} agentOn={agentOn} />
        </div>
      </Card>

      {/* Voice + language + extra context (server-backed) */}
      <VoicePicker user={user} patchMe={patchMe} authHeader={authHeader} />
      <LangPicker user={user} planKey={planKey} patchMe={patchMe} authHeader={authHeader} />
      <ExtraContextCard user={user} patchMe={patchMe} />

      {/* Appearance settings */}
      <div className="relative">
        <Card className="p-5">
          <Tag>Appearance</Tag>
          <div className="space-y-4">
            <div className="flex items-start gap-4 justify-between">
              <div>
                <p className="text-[12px] font-medium text-white/75">Auto-match site palette</p>
                <p className="text-[10px] text-white/30 mt-0.5">Analyze site colors → adapt Navi's tint automatically</p>
              </div>
              <Toggle value={autoPalette} onChange={setAutoPalette} disabled={locked} />
            </div>
            <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <p className="text-[11px] font-mono text-white/30 mb-2">Widget position</p>
              <div className="flex gap-2">
                {['bottom-left', 'bottom-center', 'bottom-right'].map(pos => (
                  <button key={pos} onClick={() => !locked && setPosition(pos)}
                    className={`flex-1 py-2 rounded-xl text-[9px] font-mono uppercase tracking-wide transition-all ${position === pos ? 'text-white/80' : 'text-white/30 hover:text-white/50'}`}
                    style={{ background: position === pos ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {pos.split('-')[1]}
                  </button>
                ))}
              </div>
            </div>
            {plan.f.watermark === false && (
              <div className="pt-3 border-t flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <div>
                  <p className="text-[12px] font-medium text-white/75">Navi watermark</p>
                  <p className="text-[10px] text-white/30">Removed on your plan</p>
                </div>
                <span className="text-[9px] font-mono px-2 py-1 rounded" style={{ background: 'rgba(61,196,90,0.1)', color: '#3dc45a' }}>Off</span>
              </div>
            )}
          </div>
        </Card>
        {locked && <LockOverlay req="Starter" />}
      </div>

      {/* Agent behavior */}
      <Card className="p-5">
        <Tag>Agent behavior</Tag>
        <div className="space-y-4">
          {[
            { label: 'Proactive activation', sub: `Activate after ${proactiveDelay}s of inactivity`, val: proactive, set: setProactive },
            { label: 'Session memory', sub: 'Remember name, preferences, intent within conversation', val: sessionMem, set: setSessionMem },
            { label: 'Multi-page memory', sub: 'Recognize returning visitors across pages and reloads', val: multiPage, set: setMultiPage },
            { label: 'Text input fallback', sub: 'Show typing option if user cannot speak', val: textFallback, set: setTextFallback },
            { label: 'Contextual highlighting', sub: 'Scroll to and highlight relevant page elements while speaking', val: highlight, set: setHighlight },
          ].map(item => (
            <div key={item.label} className="flex items-start justify-between gap-4 py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <div>
                <p className="text-[12px] font-medium text-white/75">{item.label}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{item.sub}</p>
              </div>
              <Toggle value={item.val} onChange={item.set} />
            </div>
          ))}

          {proactive && (
            <div className="pt-2">
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-white/30 w-28">Activation delay</span>
                <input type="range" min={30} max={300} step={15} value={proactiveDelay}
                  onChange={e => setProactiveDelay(Number(e.target.value))}
                  className="flex-1" style={{ accentColor: '#4a7fff' }} />
                <span className="text-[11px] font-mono text-white/50 w-12 text-right">{proactiveDelay}s</span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Page priorities */}
      <Card className="p-5">
        <Tag>Page priorities</Tag>
        <p className="text-[10px] text-white/30 mb-4">Set intent per page so Navi guides visitors toward your conversion goals</p>
        <div className="space-y-1">
          {pages.map((p, idx) => (
            <div key={p.url} className="flex items-center gap-3 py-2 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <code className="text-[11px] font-mono text-white/45 flex-1">{p.url}</code>
              <select value={p.intent}
                onChange={e => setPages(pages.map((pp, i) => i === idx ? { ...pp, intent: e.target.value } : pp))}
                className="text-[10px] font-mono border rounded-lg px-2 py-1 outline-none"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}>
                {['Convert', 'Educate', 'Awareness', 'Demo', 'Support'].map(i => <option key={i} value={i} style={{ background: '#1a1a24' }}>{i}</option>)}
              </select>
              <div className="flex gap-1">
                {['high', 'medium', 'low'].map(lvl => {
                  const active = p.priority === lvl;
                  const c = { high: '#ff5f57', medium: '#febc2e', low: 'rgba(255,255,255,0.3)' }[lvl];
                  return (
                    <button key={lvl}
                      onClick={() => setPages(pages.map((pp, i) => i === idx ? { ...pp, priority: lvl } : pp))}
                      className="text-[8px] font-mono uppercase px-2 py-0.5 rounded-full transition-all"
                      style={{ opacity: active ? 1 : 0.3, color: c, background: active ? `${c}22` : 'transparent', border: `1px solid ${active ? c : 'transparent'}` }}>
                      {lvl}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Uncertainty handling */}
      <Card className="p-5">
        <Tag>Uncertainty handling</Tag>
        <p className="text-[10px] text-white/30 mb-4">When Navi cannot answer, it redirects here instead of guessing</p>
        <div className="space-y-3">
          {[
            { label: 'Fallback email', key: 'fallbackEmail', value: fallbackEmail, set: setFallbackEmail, placeholder: 'support@yoursite.com' },
            { label: 'FAQ page', key: 'faqUrl', value: faqUrl, set: setFaqUrl, placeholder: '/faq' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-[9px] font-mono text-white/25 block mb-1">{f.label}</label>
              <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                className="w-full text-[12px] font-mono text-white/65 bg-transparent border rounded-xl px-3 py-2 outline-none transition-colors placeholder:text-white/20"
                style={{ borderColor: 'rgba(255,255,255,0.09)' }}
                onFocus={e => e.target.style.borderColor = 'rgba(74,127,255,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'} />
            </div>
          ))}
          <p className="text-[9px] font-mono text-white/20">You receive an email alert for every unanswered question</p>
        </div>
      </Card>
    </div>
  );
};

// Analytics
const AnalyticsPage = ({ plan, analytics, token }) => {
  const locked = !plan.f.analytics;
  const visitors = analytics?.visitors;
  const margin = analytics?.margin;
  const eur = (cents) => `€${((cents ?? 0) / 100).toFixed(2)}`;
  const Bar = ({ rows }) => {
    const max = Math.max(...(rows ?? []).map(r => r.n), 1);
    return (
      <div className="space-y-1.5">
        {(rows ?? []).length === 0
          ? <p className="text-[11px] font-mono text-white/20 py-2 text-center">No data yet</p>
          : rows.map(r => (
            <div key={r.label} className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-white/45 w-20 truncate">{r.label}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="h-full rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: 'rgba(74,127,255,0.55)' }} />
              </div>
              <span className="text-[10px] font-mono text-white/40 w-6 text-right">{r.n}</span>
            </div>
          ))}
      </div>
    );
  };
  const weekData = buildWeekData(analytics?.week);
  const maxW = Math.max(...weekData.map(d => d.count), 1);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Card className="p-5">
          <Tag>Conversations — last 7 days</Tag>
          <div className="flex items-end gap-2 mt-4" style={{ height: 120 }}>
            {weekData.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full">
                <div className="flex-1 flex items-end w-full">
                  <motion.div className="w-full rounded-t-sm"
                    initial={{ height: 0 }} animate={{ height: `${Math.max((d.count / maxW) * 100, d.count > 0 ? 4 : 2)}%` }}
                    transition={{ duration: 0.8, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                    style={{ background: i === 6 ? 'rgba(74,127,255,0.6)' : 'rgba(255,255,255,0.08)', minHeight: 3 }} />
                </div>
                <span className="text-[8px] font-mono text-white/20">{d.label}</span>
              </div>
            ))}
          </div>
        </Card>
        {locked && <LockOverlay />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="relative">
          <Card className="p-5">
            <Tag>Top pages by questions</Tag>
            <div className="mt-2 space-y-2">
              {(analytics?.topPages ?? []).length === 0
                ? <p className="text-[11px] font-mono text-white/20 py-3 text-center">No data yet</p>
                : (analytics?.topPages ?? []).map(p => (
                  <div key={p.page_url} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                    <code className="text-[10px] font-mono text-white/45 flex-1 truncate">{p.page_url || '/'}</code>
                    <span className="text-[11px] font-mono text-white/55">{p.questions}</span>
                  </div>
                ))
              }
            </div>
          </Card>
          {locked && <LockOverlay />}
        </div>

        <div className="relative">
          <Card className="p-5">
            <Tag>Most asked questions</Tag>
            <div className="mt-2 space-y-2">
              {(analytics?.topQuestions ?? []).length === 0
                ? <p className="text-[11px] font-mono text-white/20 py-3 text-center">No data yet</p>
                : (analytics?.topQuestions ?? []).map((q, i) => (
                  <div key={i} className="flex items-start gap-2 py-1.5 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                    <span className="text-[9px] font-mono text-white/15 w-4 flex-shrink-0 mt-0.5">{i + 1}</span>
                    <p className="text-[11px] text-white/50 flex-1 leading-snug">{q.message}</p>
                    <span className="text-[10px] font-mono text-white/35 flex-shrink-0">{q.count}×</span>
                  </div>
                ))
              }
            </div>
          </Card>
          {locked && <LockOverlay />}
        </div>
      </div>

      {/* Leads */}
      <div className="relative">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <Tag>Leads captured</Tag>
            <a href={`${BACKEND}/api/leads.csv?token=${encodeURIComponent(token)}`}
              className="text-[9px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-md transition-all"
              style={{ background: 'rgba(61,196,90,0.12)', border: '1px solid rgba(61,196,90,0.3)', color: '#3dc45a' }}>
              ↓ Export CSV
            </a>
          </div>
          <div className="flex items-center gap-3 mt-2 py-3">
            <div className="text-3xl font-light" style={{ color: '#3dc45a' }}>{analytics?.leads ?? '—'}</div>
            <div>
              <p className="text-[11px] font-mono text-white/40">visitors shared contact info</p>
              <p className="text-[9px] font-mono text-white/20">via Navi conversation</p>
            </div>
          </div>
        </Card>
        {!plan.f.leads && <LockOverlay />}
      </div>

      {/* Visitor analytics */}
      <div className="relative">
        <Card className="p-5">
          <Tag>Visitors</Tag>
          <div className="grid grid-cols-3 gap-3 mt-3 mb-5">
            {[
              { label: 'Total', value: visitors?.total ?? 0, accent: 'white' },
              { label: 'Unique', value: visitors?.unique ?? 0, accent: '#4a7fff' },
              { label: 'Returning', value: visitors?.returning ?? 0, accent: '#3dc45a' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-2xl font-light" style={{ color: s.accent }}>{s.value}</div>
                <div className="text-[9px] font-mono text-white/25 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div><p className="text-[9px] font-mono text-white/25 mb-2 uppercase tracking-wide">Country</p><Bar rows={visitors?.byCountry} /></div>
            <div><p className="text-[9px] font-mono text-white/25 mb-2 uppercase tracking-wide">Device</p><Bar rows={visitors?.byDevice} /></div>
            <div><p className="text-[9px] font-mono text-white/25 mb-2 uppercase tracking-wide">Browser</p><Bar rows={visitors?.byBrowser} /></div>
          </div>
        </Card>
        {locked && <LockOverlay />}
      </div>

      {/* Cost / margin */}
      <div className="relative">
        <Card className="p-5">
          <Tag>Margin — current cycle</Tag>
          <div className="grid grid-cols-4 gap-3 mt-3">
            {[
              { label: 'Revenue', value: eur(margin?.revenue_cents), accent: 'white' },
              { label: 'API cost', value: eur(margin?.cost_cents), accent: '#febc2e' },
              { label: 'Margin', value: eur(margin?.margin_cents), accent: (margin?.margin_cents ?? 0) >= 0 ? '#3dc45a' : '#ff5f57' },
              { label: 'Margin %', value: margin?.margin_pct != null ? `${margin.margin_pct}%` : '—', accent: '#4a7fff' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-lg font-light" style={{ color: s.accent }}>{s.value}</div>
                <div className="text-[9px] font-mono text-white/25 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[9px] font-mono text-white/20 mt-3">{margin?.sessions ?? 0} voice sessions this cycle · cost ≈ €0.08/session</p>
        </Card>
        {locked && <LockOverlay />}
      </div>
    </div>
  );
};

// Settings
const SettingsPage = ({ plan, planKey, apiKey, user }) => {
  const [notifEmail, setNotifEmail] = useStored('notifEmail', user?.email ?? '');
  const [leadAlert, setLeadAlert] = useStored('leadAlert', true);
  const [unknownAlert, setUnknownAlert] = useStored('unknownAlert', true);
  const [weeklyDigest, setWeeklyDigest] = useStored('weeklyDigest', true);
  const [keyVisible, setKeyVisible] = useState(false);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Tag>Notifications</Tag>
        <div className="mb-4">
          <label className="text-[9px] font-mono text-white/25 block mb-1.5">Send alerts to</label>
          <input value={notifEmail} onChange={e => setNotifEmail(e.target.value)} placeholder="you@yoursite.com"
            className="w-full text-[12px] font-mono text-white/65 bg-transparent border rounded-xl px-3 py-2 outline-none max-w-sm transition-colors placeholder:text-white/20"
            style={{ borderColor: 'rgba(255,255,255,0.09)' }}
            onFocus={e => e.target.style.borderColor = 'rgba(74,127,255,0.5)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'} />
        </div>
        <div className="space-y-3">
          {[
            { label: 'Lead captured', sub: 'Instant email when a visitor shares contact info', val: leadAlert, set: setLeadAlert },
            { label: 'Unanswered question', sub: 'Alert when Navi cannot answer a question', val: unknownAlert, set: setUnknownAlert },
            { label: 'Weekly digest', sub: 'Summary of conversations, leads, top questions', val: weeklyDigest, set: setWeeklyDigest },
          ].map(item => (
            <div key={item.label} className="flex items-start justify-between gap-4 py-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              <div>
                <p className="text-[12px] font-medium text-white/75">{item.label}</p>
                <p className="text-[10px] text-white/30">{item.sub}</p>
              </div>
              <Toggle value={item.val} onChange={item.set} disabled={!plan.f.leads} />
            </div>
          ))}
          {!plan.f.leads && (
            <p className="text-[10px] font-mono text-white/25">Lead notifications require Starter. <a href="?plan=starter" style={{ color: 'rgba(130,180,255,0.7)' }}>Upgrade →</a></p>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <Tag>API key</Tag>
        <div className="flex items-center gap-2 mt-2">
          <code className="flex-1 text-[11px] font-mono text-white/40 px-3 py-2 rounded-xl min-w-0 truncate"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {keyVisible ? apiKey : apiKey.replace(/sk_live_\w+/, 'sk_live_••••••••••••••••')}
          </code>
          <button onClick={() => setKeyVisible(v => !v)}
            className="text-[10px] font-mono text-white/30 hover:text-white/60 transition-colors flex-shrink-0 px-2">
            {keyVisible ? 'Hide' : 'Reveal'}
          </button>
        </div>
        <p className="text-[9px] font-mono text-white/15 mt-2">Keep secret. Embed in your site only via the script tag above.</p>
      </Card>

      <Card className="p-5">
        <Tag>Plan</Tag>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-white">{plan.label}</p>
            <p className="text-[11px] font-mono text-white/30 mt-0.5">
              {plan.sessionMax.toLocaleString()} sess{plan.sessionUnit} · {plan.agents} agent{plan.agents > 1 ? 's' : ''} · {plan.pages.toLocaleString()} pages
            </p>
            {user?.email && <p className="text-[9px] font-mono text-white/20 mt-1">{user.email}</p>}
          </div>
          <a href="/" className="text-[11px] font-mono px-4 py-2 rounded-full transition-all"
            style={{ background: 'rgba(74,127,255,0.12)', border: '1px solid rgba(74,127,255,0.3)', color: 'rgba(130,180,255,0.8)' }}>
            {planKey === 'agency' ? 'Manage' : 'Upgrade →'}
          </a>
        </div>
      </Card>

      {/* Integrations */}
      <div className="relative">
        <Card className="p-5">
          <Tag>Platform plugins</Tag>
          <p className="text-[10px] text-white/30 mb-4">One-click install, no code required</p>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map(p => (
              <div key={p.id} className="flex items-center gap-2.5 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold text-white/50 flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>{p.label[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-white/65">{p.label}</p>
                  <span className="text-[8px] font-mono"
                    style={{ color: p.s === 'available' ? '#3dc45a' : p.s === 'beta' ? '#febc2e' : 'rgba(255,255,255,0.25)' }}>
                    {p.s}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
        {!plan.f.plugins && <LockOverlay req="Business" />}
      </div>
    </div>
  );
};

// ── Transcripts ───────────────────────────────────────────────────────────────
const TranscriptsPage = ({ authHeader }) => {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = (query, pg) => {
    setLoading(true);
    fetch(`${BACKEND}/api/conversations?q=${encodeURIComponent(query)}&page=${pg}`, { headers: authHeader })
      .then(r => (r.ok ? r.json() : { rows: [], hasMore: false, page: 0 }))
      .then(d => { setRows(d.rows ?? []); setHasMore(!!d.hasMore); setPage(d.page ?? 0); setLoading(false); })
      .catch(() => setLoading(false));
  };

  // Debounced search on query change.
  useEffect(() => {
    const t = setTimeout(() => load(q, 0), 300);
    return () => clearTimeout(t);
  }, [q]);  

  const fmt = (ts) => new Date((ts ?? 0) * 1000).toLocaleString();

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Tag>Transcript search</Tag>
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search conversations — questions or replies…"
          className="w-full mt-2 text-[12px] font-mono text-white/70 bg-transparent border rounded-xl px-3 py-2.5 outline-none transition-colors placeholder:text-white/20"
          style={{ borderColor: 'rgba(255,255,255,0.09)' }}
          onFocus={e => e.target.style.borderColor = 'rgba(74,127,255,0.5)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'} />
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-2">
          <Tag>{q ? `Results for "${q}"` : 'All conversations'}</Tag>
          <span className="text-[9px] font-mono text-white/25">{rows.length} shown</span>
        </div>
        {loading ? (
          <p className="text-[11px] font-mono text-white/20 py-6 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] font-mono text-white/20 py-6 text-center">No conversations found.</p>
        ) : (
          <div className="space-y-3">
            {rows.map(c => (
              <div key={c.id} className="py-2.5 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[9px] font-mono text-white/25">{c.visitor_id ? `Visitor ${c.visitor_id.slice(0, 8)}` : 'Visitor'}</span>
                  {c.is_lead ? <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(61,196,90,0.12)', color: '#3dc45a' }}>lead</span> : null}
                  <span className="ml-auto text-[9px] font-mono text-white/20">{fmt(c.created_at)}</span>
                </div>
                <p className="text-[12px] text-white/75 leading-snug"><span className="text-white/30">Q:</span> {c.message}</p>
                <p className="text-[12px] text-white/45 leading-snug mt-0.5"><span className="text-white/25">A:</span> {c.reply}</p>
                {c.page_url ? <code className="text-[9px] font-mono text-white/20">{c.page_url}</code> : null}
              </div>
            ))}
          </div>
        )}
        {(page > 0 || hasMore) && !loading && (
          <div className="flex items-center justify-between mt-4">
            <button disabled={page === 0} onClick={() => load(q, page - 1)}
              className="text-[10px] font-mono px-3 py-1.5 rounded-lg transition-all disabled:opacity-25"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>← Prev</button>
            <span className="text-[9px] font-mono text-white/25">Page {page + 1}</span>
            <button disabled={!hasMore} onClick={() => load(q, page + 1)}
              className="text-[10px] font-mono px-3 py-1.5 rounded-lg transition-all disabled:opacity-25"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}>Next →</button>
          </div>
        )}
      </Card>
    </div>
  );
};

// ── Voice picker ──────────────────────────────────────────────────────────────
const VoicePicker = ({ user, patchMe, authHeader }) => {
  const [voices, setVoices] = useState([]);
  const [sel, setSel] = useState(user.voice || 'onyx');
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    fetch(`${BACKEND}/api/voices`, { headers: authHeader })
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setVoices(d.voices))
      .catch(() => {});
  }, []);  

  const pick = (id) => { setSel(id); patchMe({ voice: id }); };

  const preview = (id) => {
    if (playing) return;
    setPlaying(id);
    fetch(`${BACKEND}/api/voice/preview`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice: id }),
    })
      .then(r => (r.ok ? r.blob() : Promise.reject()))
      .then(b => {
        const a = new Audio(URL.createObjectURL(b));
        a.onended = () => setPlaying(null);
        a.onerror = () => setPlaying(null);
        a.play();
      })
      .catch(() => setPlaying(null));
  };

  return (
    <Card className="p-5">
      <Tag>Agent voice</Tag>
      <p className="text-[10px] text-white/30 mb-4">Pick the voice your visitors hear. Tap ▶ to preview.</p>
      <div className="grid grid-cols-2 gap-2">
        {voices.map(v => (
          <div key={v.id}
            className="flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all"
            onClick={() => pick(v.id)}
            style={{
              background: sel === v.id ? 'rgba(74,127,255,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${sel === v.id ? 'rgba(74,127,255,0.4)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            <button onClick={e => { e.stopPropagation(); preview(v.id); }}
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px]"
              style={{ background: 'rgba(255,255,255,0.08)', color: playing === v.id ? '#4a7fff' : 'rgba(255,255,255,0.6)' }}>
              {playing === v.id ? '♪' : '▶'}
            </button>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/75">{v.label}</p>
              <p className="text-[9px] text-white/30 truncate">{v.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

// ── Language picker ───────────────────────────────────────────────────────────
const LangPicker = ({ user, planKey, patchMe, authHeader }) => {
  const [langs, setLangs] = useState([]);
  const [lang, setLang] = useState(user.lang || 'en');
  const [auto, setAuto] = useState(!!user.lang_auto);
  const paid = planKey !== 'free';

  useEffect(() => {
    fetch(`${BACKEND}/api/voices`, { headers: authHeader })
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setLangs(d.languages))
      .catch(() => {});
  }, []);  

  const setLanguage = (l) => { setLang(l); patchMe({ lang: l }); };
  const setAutoSwitch = (v) => { if (!paid) return; setAuto(v); patchMe({ lang_auto: v ? 1 : 0 }); };

  return (
    <Card className="p-5">
      <Tag>Language</Tag>
      <p className="text-[10px] text-white/30 mb-4">Default language the agent speaks.</p>
      <select value={lang} onChange={e => setLanguage(e.target.value)}
        className="w-full text-[12px] font-mono text-white/70 border rounded-xl px-3 py-2 outline-none"
        style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.09)' }}>
        {langs.map(l => <option key={l.id} value={l.id} style={{ background: '#1a1a24' }}>{l.label}</option>)}
      </select>
      <div className="flex items-start justify-between gap-4 mt-4 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div>
          <p className="text-[12px] font-medium text-white/75">Auto-switch language</p>
          <p className="text-[10px] text-white/30 mt-0.5">
            {paid ? 'Detect and follow the visitor’s language live' : 'Paid plans only — upgrade to enable'}
          </p>
        </div>
        <Toggle value={auto} onChange={setAutoSwitch} disabled={!paid} />
      </div>
    </Card>
  );
};

// ── Extra context ─────────────────────────────────────────────────────────────
const ExtraContextCard = ({ user, patchMe }) => {
  const [text, setText] = useState(user.extra_context || '');
  const [saved, setSaved] = useState(false);

  const save = () => {
    patchMe({ extra_context: text });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <Card className="p-5">
      <Tag>Extra context</Tag>
      <p className="text-[10px] text-white/30 mb-3">
        Facts the crawler can’t see — promotions, policies, tone notes. Injected into every agent reply.
      </p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
        placeholder="e.g. We offer free shipping over €50. Support hours 9–18 CET. Always mention the spring sale."
        className="w-full text-[12px] text-white/70 bg-transparent border rounded-xl px-3 py-2.5 outline-none resize-y transition-colors placeholder:text-white/20"
        style={{ borderColor: 'rgba(255,255,255,0.09)' }}
        onFocus={e => e.target.style.borderColor = 'rgba(74,127,255,0.5)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.09)'} />
      <button onClick={save}
        className="mt-3 text-[10px] font-mono uppercase tracking-widest px-4 py-2 rounded-lg transition-all"
        style={{ background: saved ? 'rgba(61,196,90,0.15)' : 'rgba(74,127,255,0.12)', border: `1px solid ${saved ? 'rgba(61,196,90,0.4)' : 'rgba(74,127,255,0.3)'}`, color: saved ? '#3dc45a' : 'rgba(130,180,255,0.85)' }}>
        {saved ? '✓ Saved' : 'Save context'}
      </button>
    </Card>
  );
};

// ── Knowledge base card (re-crawl) ────────────────────────────────────────────
const KBCard = ({ user, authHeader }) => {
  const [status, setStatus] = useState({ status: user.kb_status || 'none', pages: user.kb_pages || 0, chunks: 0 });
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    fetch(`${BACKEND}/api/kb/status`, { headers: authHeader })
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setStatus(d))
      .catch(() => {});
  };
  useEffect(() => { refresh(); }, []);  

  // Poll while a crawl is running.
  useEffect(() => {
    if (status.status !== 'crawling') return;
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [status.status]);  

  const recrawl = () => {
    if (busy || status.status === 'crawling') return;
    setBusy(true);
    fetch(`${BACKEND}/api/kb/crawl`, { method: 'POST', headers: authHeader })
      .then(r => r.json())
      .then(() => { setStatus(s => ({ ...s, status: 'crawling' })); setBusy(false); })
      .catch(() => setBusy(false));
  };

  const COLORS = { ready: '#3dc45a', crawling: '#febc2e', error: '#ff5f57', none: 'rgba(255,255,255,0.3)' };
  const LABELS = { ready: 'Knowledge base ready', crawling: 'Crawling site…', error: 'Crawl failed', none: 'Not crawled yet' };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-2">
        <Tag>Knowledge base</Tag>
        <button onClick={recrawl} disabled={status.status === 'crawling' || busy}
          className="text-[9px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-md transition-all disabled:opacity-40"
          style={{ background: 'rgba(74,127,255,0.12)', border: '1px solid rgba(74,127,255,0.3)', color: 'rgba(130,180,255,0.85)' }}>
          {status.status === 'crawling' ? 'Crawling…' : 'Re-crawl'}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[status.status] ?? COLORS.none }} />
        <span className="text-[13px] text-white/70">{LABELS[status.status] ?? 'Unknown'}</span>
        {status.status === 'ready' && (
          <span className="ml-auto text-[10px] font-mono text-white/30">{status.pages} pages · {status.chunks} chunks</span>
        )}
      </div>
      {!user.site_url && (
        <p className="text-[10px] font-mono text-white/25 mt-2">Set your site URL in Settings to enable crawling.</p>
      )}
    </Card>
  );
};

// ── Session pack purchase ─────────────────────────────────────────────────────
const PackBuyButton = ({ authHeader }) => {
  const [busy, setBusy] = useState(false);
  const buy = () => {
    setBusy(true);
    fetch(`${BACKEND}/api/checkout/pack`, {
      method: 'POST',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ packs: 1 }),
    })
      .then(r => r.json())
      .then(d => { if (d.redirect) window.location.href = d.redirect; else setBusy(false); })
      .catch(() => setBusy(false));
  };
  return (
    <button onClick={buy} disabled={busy}
      className="text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}>
      {busy ? 'Redirecting…' : '+ Buy 100 sessions'}
    </button>
  );
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'overview',    label: 'Overview'    },
  { id: 'customize',   label: 'Customize'   },
  { id: 'transcripts', label: 'Transcripts' },
  { id: 'analytics',   label: 'Analytics', gate: 'analytics' },
  { id: 'settings',    label: 'Settings'    },
];

const Sidebar = ({ planKey, plan, page, onNav }) => (
  <div className="fixed top-0 left-0 h-screen flex flex-col z-20"
    style={{ width: 200, background: 'rgba(8,8,12,0.97)', borderRight: '1px solid rgba(255,255,255,0.055)' }}>
    {/* Logo */}
    <div className="flex items-center gap-2.5 px-5 h-16 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <div className="relative flex-shrink-0">
        <img src="/vinile-finale.png" alt="Navi" className="w-7 h-7 rounded-full object-cover" />
        <motion.div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
          style={{ background: '#3dc45a', borderColor: '#06060a' }}
          animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
      </div>
      <span className="text-sm font-semibold text-white">Navi</span>
      <span className="ml-auto text-[8px] font-mono px-2 py-0.5 rounded-full"
        style={{ background: `${plan.color}1a`, border: `1px solid ${plan.color}44`, color: plan.color }}>
        {plan.label}
      </span>
    </div>

    {/* Nav items */}
    <nav className="flex-1 py-3 px-3">
      {NAV.map(item => {
        const locked = item.gate && !plan.f[item.gate];
        const active = page === item.id;
        return (
          <button key={item.id} onClick={() => onNav(item.id)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-0.5 text-left transition-all duration-150"
            style={{
              background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
            }}>
            <span className="text-[13px]">{item.label}</span>
            {locked && !active && (
              <svg className="ml-auto opacity-50" width="9" height="10" viewBox="0 0 9 10" fill="none">
                <rect x="0.5" y="4" width="8" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.1" />
                <path d="M2 4V3A2.5 2.5 0 0 1 7 3v1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            )}
          </button>
        );
      })}
    </nav>

    {/* Footer */}
    <div className="p-3 border-t space-y-1.5" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      {planKey !== 'agency' && (
        <a href={planKey === 'free' ? '?plan=starter' : planKey === 'starter' ? '?plan=business' : '?plan=agency'} className="flex items-center justify-center w-full py-2 rounded-xl text-[10px] font-mono tracking-widest uppercase transition-all"
          style={{ background: 'rgba(74,127,255,0.1)', border: '1px solid rgba(74,127,255,0.25)', color: 'rgba(130,180,255,0.75)' }}>
          Upgrade plan
        </a>
      )}
      <a href="/" className="flex items-center justify-center w-full py-2 rounded-xl text-[10px] font-mono text-white/20 hover:text-white/45 transition-colors">
        ← Back to site
      </a>
    </div>
  </div>
);

// ── Dashboard ─────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [user, setUser] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [page, setPage] = useState('overview');
  const [agentOn, setAgentOnRaw] = useState(true);
  const [vinylId, setVinylIdRaw] = useState('midnight');

  const authHeader = { 'x-dashboard-token': token };

  useEffect(() => {
    if (!token) {
      setAuthError('No token found. Open your dashboard link from the welcome email.');
      setLoading(false);
      return;
    }
    Promise.all([
      fetch(`${BACKEND}/api/me`, { headers: authHeader })
        .then(r => r.ok ? r.json() : r.json().then(d => { throw new Error(d.error ?? 'Authentication failed'); })),
      fetch(`${BACKEND}/api/analytics`, { headers: authHeader }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${BACKEND}/api/conversations`, { headers: authHeader }).then(r => r.ok ? r.json() : { rows: [] }).catch(() => ({ rows: [] })),
    ]).then(([u, a, c]) => {
      setUser(u);
      setAgentOnRaw(!!u.agent_enabled);
      setVinylIdRaw(u.vinyl_color ?? 'midnight');
      if (a) setAnalytics(a);
      // /api/conversations returns { rows, page, hasMore } — recent wants the array.
      setRecent(Array.isArray(c) ? c : (c.rows ?? []));
      setLoading(false);
    }).catch(e => { setAuthError(e.message); setLoading(false); });
  }, [token]);

  const setAgentOn = (val) => {
    setAgentOnRaw(val);
    fetch(`${BACKEND}/api/me`, {
      method: 'PATCH',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_enabled: val ? 1 : 0 }),
    }).catch(console.error);
  };

  const setVinylId = (id) => {
    setVinylIdRaw(id);
    fetch(`${BACKEND}/api/me`, {
      method: 'PATCH',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vinyl_color: id }),
    }).catch(console.error);
  };

  // Generic settings patch — optimistic local update + PATCH /me.
  const patchMe = (patch) => {
    setUser(u => ({ ...u, ...patch }));
    return fetch(`${BACKEND}/api/me`, {
      method: 'PATCH',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(console.error);
  };

  if (loading) return <LoadingScreen />;
  if (authError) return <ErrorScreen message={authError} />;

  const planKey = (user.plan in PLANS) ? user.plan : 'free';
  const plan = PLANS[planKey];
  const vinyl = vinylById(vinylId);
  const setVinyl = (v) => setVinylId(v.id);

  const TITLES = { overview: 'Overview', customize: 'Customize', transcripts: 'Transcripts', analytics: 'Analytics', settings: 'Settings' };

  return (
    <div className="min-h-screen font-sans text-white" style={{ background: '#06060a' }}>
      <Sidebar planKey={planKey} plan={plan} page={page} onNav={setPage} />
      <div style={{ marginLeft: 200 }}>
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-8 h-16 border-b"
          style={{ background: 'rgba(6,6,10,0.92)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.05)' }}>
          <h1 className="text-[15px] font-semibold text-white">{TITLES[page]}</h1>
          <span className="text-[10px] font-mono text-white/20">{user.email}</span>
        </div>

        {/* Page content */}
        <div className="p-8 max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div key={page}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
              {page === 'overview'    && <OverviewPage    planKey={planKey} plan={plan} agentOn={agentOn} setAgentOn={setAgentOn} vinyl={vinyl} apiKey={user.api_key} minuteUsed={user.minute_used} analytics={analytics} recent={recent} authHeader={authHeader} user={user} />}
              {page === 'customize'   && <CustomizePage   plan={plan} planKey={planKey} vinyl={vinyl} setVinyl={setVinyl} agentOn={agentOn} user={user} patchMe={patchMe} authHeader={authHeader} />}
              {page === 'transcripts' && <TranscriptsPage authHeader={authHeader} />}
              {page === 'analytics'   && <AnalyticsPage   plan={plan} analytics={analytics} token={token} />}
              {page === 'settings'    && <SettingsPage    plan={plan} planKey={planKey} apiKey={user.api_key} user={user} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
