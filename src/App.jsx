import { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValue, useSpring, AnimatePresence, useMotionValueEvent } from 'framer-motion';
import VoiceAgent from './VoiceAgent';
import CookieBanner, { hasConsent } from './CookieBanner';
import Footer from './Footer';
import CheckoutModal from './CheckoutModal';
import { createContext, useContext } from 'react';

export const LanguageContext = createContext();

const playSwitch = (() => {
  let ctx = null;
  return () => {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(680, ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.07, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.06);
    } catch (_) { /* AudioContext unavailable — ignore */ }
  };
})();

const playClick = (() => {
  let ctx = null;
  return () => {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      [[620, 0], [980, 0.038]].forEach(([freq, delay]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, t + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.03);
        osc.start(t + delay);
        osc.stop(t + delay + 0.04);
      });
    } catch (_) { /* AudioContext unavailable — ignore */ }
  };
})();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};

const FadeUp = ({ children, delay = 0, className = "" }) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
    whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 1.2, delay, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.div>
);

const StaggerContainer = ({ children, className = "" }) => (
  <motion.div
    className={className}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: "-50px" }}
    variants={{
      hidden: {},
      visible: { transition: { staggerChildren: 0.3 } }
    }}
  >
    {children}
  </motion.div>
);

const StaggerItem = ({ children, className = "" }) => (
  <motion.div
    className={className}
    variants={{
      hidden: { opacity: 0, y: 40, filter: 'blur(10px)' },
      visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] } }
    }}
  >
    {children}
  </motion.div>
);

const agentValues = [
  { label: 'Latency', value: '<300', unit: 'ms', side: 'left' },
  { label: 'Accuracy', value: '98.5', unit: '%', side: 'left' },
  { label: 'Languages', value: '12', unit: '', side: 'left' },
  { label: 'Uptime', value: '99.9', unit: '%', side: 'right' },
  { label: 'Voices', value: '24', unit: '', side: 'right' },
  { label: 'Integrations', value: '40+', unit: '', side: 'right' },
];

const ValueEntry = ({ val, textDone, delay }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={textDone ? { opacity: 1 } : {}}
    transition={{ duration: 0.1, delay }}
  >
    <motion.div
      initial={{ opacity: 0, x: val.side === 'left' ? -18 : 18 }}
      animate={textDone ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 1.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={val.side === 'left' ? 'text-right' : 'text-left'}
    >
      <span className="text-[7px] font-mono tracking-[0.35em] text-white/25 uppercase block mb-1">
        {val.label}
      </span>
      <div className={`flex items-baseline gap-1 ${val.side === 'left' ? 'justify-end' : 'justify-start'}`}>
        <span className="text-[22px] font-light text-white/80 tracking-[0.12em]">{val.value}</span>
        {val.unit && <span className="text-[8px] font-mono text-white/25">{val.unit}</span>}
      </div>
      <div className="h-px bg-white/[0.07] mt-2" />
    </motion.div>
  </motion.div>
);

const SNIPPETS = {
  script: `<script src="https://getnavi.dev/widget.js" data-key="YOUR_KEY" defer></script>`,
  npm: `npm install @navi-ai/widget`,
};

const InstallSnippet = () => {
  const [tab, setTab] = useState('script');
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(SNIPPETS[tab]).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <motion.div
      className="mt-10 mx-auto w-full max-w-2xl"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 1, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-2 px-1">
        {[{ id: 'script', label: 'Script tag' }, { id: 'npm', label: 'npm' }].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            onMouseDown={playSwitch}
            className={`text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full transition-all duration-200 ${tab === t.id
              ? 'bg-white/10 text-white/80'
              : 'text-white/30 hover:text-white/50'
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Code block */}
      <div
        className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl border border-white/[0.08]"
        style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
      >
        {/* Terminal prompt + code */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="text-white/20 font-mono text-xs flex-shrink-0 select-none">$</span>
          <span className="font-mono text-xs text-white/60 truncate">
            {tab === 'script'
              ? <><span className="text-[#7db3ff]">{'<script'}</span><span className="text-white/40">{' src='}</span><span className="text-[#7dde8a]">"https://getnavi.dev/widget.js"</span><span className="text-white/40">{' data-key='}</span><span className="text-[#7dde8a]">"YOUR_KEY"</span><span className="text-[#7db3ff]">{' defer></script>'}</span></>
              : <><span className="text-white/40">npm install </span><span className="text-[#7dde8a]">@navi-ai/widget</span></>
            }
          </span>
        </div>

        {/* Copy button */}
        <motion.button
          onClick={copy}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono tracking-widest uppercase transition-all duration-200 border"
          style={{
            background: copied ? 'rgba(94,162,54,0.15)' : 'rgba(255,255,255,0.05)',
            borderColor: copied ? 'rgba(94,162,54,0.4)' : 'rgba(255,255,255,0.1)',
            color: copied ? '#5ea236' : 'rgba(255,255,255,0.4)',
          }}
        >
          {copied ? (
            <><svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#5ea236" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> Copied</>
          ) : (
            <><svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="3" y="3" width="6" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" /><path d="M1 1h5a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg> Copy</>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
};

const BrowserMockup = ({ vinyl = '/vinile-finale.png' }) => {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPulse(p => (p + 1) % 3), 1400);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Browser chrome */}
      <motion.div
        className="rounded-2xl overflow-hidden shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
        style={{ background: 'linear-gradient(135deg, #141418 0%, #1a1a24 100%)', border: '1px solid rgba(255,255,255,0.08)' }}
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-60px' }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          {/* URL bar */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-mono text-white/30" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', minWidth: '220px', maxWidth: '340px' }}>
              <svg className="w-3 h-3 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span className="truncate">yoursite.com</span>
            </div>
          </div>
          <div className="w-16" />
        </div>

        {/* Page content — skeleton UI */}
        <div className="relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0e0e14 0%, #111118 60%, #0d0d13 100%)', minHeight: '420px' }}>

          {/* Gradient accent top-right */}
          <div className="absolute top-0 right-0 w-80 h-60 pointer-events-none" style={{ background: 'radial-gradient(ellipse at top right, rgba(88,140,255,0.07) 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 left-0 w-64 h-48 pointer-events-none" style={{ background: 'radial-gradient(ellipse at bottom left, rgba(88,196,180,0.05) 0%, transparent 70%)' }} />

          {/* Nav skeleton */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.05]">
            <div className="w-16 h-3 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
            <div className="flex gap-5">
              {[48, 36, 52, 40].map((w, i) => (
                <div key={i} className="h-2 rounded-full" style={{ width: w, background: 'rgba(255,255,255,0.06)' }} />
              ))}
            </div>
            <div className="w-20 h-6 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>

          {/* Hero skeleton */}
          <div className="px-8 pt-10 pb-6">
            <div className="w-16 h-2 rounded-full mb-6" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="space-y-3 mb-8">
              <div className="h-8 rounded-lg" style={{ width: '72%', background: 'rgba(255,255,255,0.09)' }} />
              <div className="h-8 rounded-lg" style={{ width: '54%', background: 'rgba(255,255,255,0.07)' }} />
            </div>
            <div className="space-y-2 mb-10">
              {[80, 68, 74, 40].map((w, i) => (
                <div key={i} className="h-2 rounded-full" style={{ width: `${w}%`, background: 'rgba(255,255,255,0.04)' }} />
              ))}
            </div>
            <div className="flex gap-3">
              <div className="w-32 h-9 rounded-full" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.15)' }} />
              <div className="w-28 h-9 rounded-full" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
            </div>
          </div>

          {/* Cards row skeleton */}
          <div className="px-8 pb-8 grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-8 h-8 rounded-lg mb-3" style={{ background: 'rgba(255,255,255,0.07)' }} />
                <div className="h-2 rounded-full mb-2" style={{ width: '60%', background: 'rgba(255,255,255,0.07)' }} />
                <div className="space-y-1.5">
                  {[80, 65, 50].map((w, j) => (
                    <div key={j} className="h-1.5 rounded-full" style={{ width: `${w}%`, background: 'rgba(255,255,255,0.04)' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Navi widget — bottom center */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            {/* Transcript bubble */}
            <motion.div
              className="px-4 py-2 rounded-xl text-[10px] font-mono text-white/70 mb-1"
              style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: 260 }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              "How does Navi work?"
            </motion.div>

            {/* Status pill */}
            <div className="px-4 py-1.5 rounded-full text-[10px] font-sans font-medium text-[#1a1a1a]" style={{ background: '#a6b1b6' }}>
              {['Live Session', 'Listening…', 'Speaking'][pulse]}
            </div>

            {/* Widget bar */}
            <div className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-full shadow-2xl" style={{ background: '#a6b1b6' }}>
              {/* Logo circle */}
              <div className="w-9 h-9 rounded-full overflow-hidden shadow-sm relative flex-shrink-0">
                <motion.img
                  key={vinyl}
                  src={vinyl}
                  alt="Navi"
                  className="w-full h-full object-cover"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(94,162,54,0.25)' }}
                  animate={{ scale: [1, 1.6, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              {/* Name + status */}
              <div className="flex flex-col min-w-[60px]">
                <span className="text-[#1a1a1a] text-[11px] font-bold leading-tight">Navi</span>
                <span className="text-[9px] font-medium leading-tight" style={{ color: pulse === 1 ? '#5ea236' : '#555' }}>
                  {['Active', 'Listening…', 'Speaking'][pulse]}
                </span>
              </div>
              {/* Waveform */}
              <div className="flex items-center gap-[3px] mx-2 h-5 w-6 justify-center">
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full"
                    style={{ background: pulse === 1 ? '#5ea236' : '#4a5559' }}
                    animate={{ height: ['20%', '100%', '20%'] }}
                    transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              {/* Mic */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: pulse === 1 ? '#5ea236' : '#8c9ba1' }}>
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="11" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="9" y1="22" x2="15" y2="22" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Install snippet */}
      <InstallSnippet />
    </div>
  );
};

const FrequencyRing = ({ vinylSize = 110, barCount = 20, color = 'rgba(88,196,236,0.65)' }) => {
  const gap = 5;
  const maxBarLen = 14;
  const svgPad = gap + maxBarLen + 2;
  const svgSize = vinylSize + svgPad * 2;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const innerR = vinylSize / 2 + gap;

  return (
    <svg
      className="absolute pointer-events-none"
      width={svgSize}
      height={svgSize}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: 0 }}
    >
      {[...Array(barCount)].map((_, i) => {
        const angle = (i * 360) / barCount - 90;
        const rad = (angle * Math.PI) / 180;
        const x1 = cx + innerR * Math.cos(rad);
        const y1 = cy + innerR * Math.sin(rad);
        const minLen = 3;
        const maxLen = 4 + (i % 5) * 2.5;
        const x2min = cx + (innerR + minLen) * Math.cos(rad);
        const y2min = cy + (innerR + minLen) * Math.sin(rad);
        const x2max = cx + (innerR + maxLen) * Math.cos(rad);
        const y2max = cy + (innerR + maxLen) * Math.sin(rad);
        const duration = 0.42 + (i % 6) * 0.09;
        const delay = (i / barCount) * 1.1;
        return (
          <motion.line
            key={i}
            x1={x1} y1={y1}
            x2={x2min} y2={y2min}
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            animate={{ x2: [x2min, x2max, x2min], y2: [y2min, y2max, y2min], opacity: [0.2, 0.8, 0.2] }}
            transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        );
      })}
    </svg>
  );
};

const VINYL_FILTERS = {
  '/vinile-finale.png': 'none',
  '/vinile-trasparente.png': 'none',
  '/vinile-arancione.png': 'hue-rotate(-172deg) saturate(1.4)',
  '/vinile-rosso.png': 'hue-rotate(155deg) saturate(1.4)',
  '/vinile-verde.png': 'hue-rotate(-90deg) saturate(1.3)',
  '/vinile-viola.png': 'hue-rotate(60deg) saturate(1.3)',
};

const VINYL_COLORS = [
  '/vinile-finale.png',
  '/vinile-trasparente.png',
  '/vinile-arancione.png',
  '/vinile-rosso.png',
  '/vinile-verde.png',
  '/vinile-viola.png',
];

const AgentSection = ({ onChipClick, selectedVinyl, setSelectedVinyl }) => {
  const ref = useRef(null);
  const hasTriggered = useRef(false);
  const [textDone, setTextDone] = useState(false);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'start 0.15'],
  });

  const labelOpacity = useTransform(scrollYProgress, [0, 0.07], [0, 1]);
  const labelY = useTransform(scrollYProgress, [0, 0.07], [10, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0.05, 0.22], [0, 1]);
  const titleY = useTransform(scrollYProgress, [0.05, 0.22], [40, 0]);
  const p1Opacity = useTransform(scrollYProgress, [0.20, 0.40], [0, 1]);
  const p1Y = useTransform(scrollYProgress, [0.20, 0.40], [24, 0]);
  const p2Opacity = useTransform(scrollYProgress, [0.36, 0.56], [0, 1]);
  const p2Y = useTransform(scrollYProgress, [0.36, 0.56], [24, 0]);

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (v > 0.52 && !hasTriggered.current) {
      hasTriggered.current = true;
      setTextDone(true);
    }
  });

  const rawMouseX = useMotionValue(0);
  const rawMouseY = useMotionValue(0);
  const bottleX = useSpring(useTransform(rawMouseX, [-1, 1], [-18, 18]), { stiffness: 60, damping: 20 });
  const bottleY = useSpring(useTransform(rawMouseY, [-1, 1], [-8, 8]), { stiffness: 60, damping: 20 });

  useEffect(() => {
    const onMove = (e) => {
      rawMouseX.set((e.clientX / window.innerWidth - 0.5) * 2);
      rawMouseY.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [rawMouseX, rawMouseY]);

  const leftVals = agentValues.filter(v => v.side === 'left');
  const rightVals = agentValues.filter(v => v.side === 'right');

  return (
    <div ref={ref} className="mb-20 border-t border-white/10 pt-20 w-full max-w-[90rem] mx-auto px-4 md:px-8">
      <motion.span
        className="text-xs font-mono tracking-[0.2em] text-white/50 uppercase block mb-10"
        style={{ opacity: labelOpacity, y: labelY }}
      >
        [ THE PRODUCT ]
      </motion.span>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 md:gap-16 w-full items-center">
        <div className="lg:col-span-5 flex flex-col justify-center">
          <motion.h2
            className="text-5xl md:text-7xl font-semibold tracking-tight text-white drop-shadow-lg mb-8"
            style={{ opacity: titleOpacity, y: titleY }}
          >
            Intelligence.
          </motion.h2>
          <motion.p
            className="text-white/80 text-xl leading-relaxed font-light mb-6"
            style={{ opacity: p1Opacity, y: p1Y }}
          >
            Built to understand, not just respond. Navi learns your entire site: structure, content, tone. Sub-300ms latency. 12 languages. Zero scripts.
          </motion.p>
          <motion.p
            className="text-white/80 text-xl leading-relaxed font-light"
            style={{ opacity: p2Opacity, y: p2Y }}
          >
            Navi is the opposite of a FAQ. It does not list answers. It finds what a visitor needs before they know how to ask. Every doubt dissolved. Every visitor guided.
          </motion.p>
        </div>

        <div className="lg:col-span-7 flex items-center justify-center w-full relative min-h-[560px]">

          <div className="flex flex-col gap-9 items-end flex-shrink-0 w-[120px] md:w-[150px] relative z-10">
            {leftVals.map((val, i) => (
              <ValueEntry key={val.label} val={val} textDone={textDone} delay={0.15 + i * 0.32} />
            ))}
          </div>

          {/* Vinyl + color carousel */}
          <div className="relative z-10 mx-4 md:mx-8 flex-shrink-0 flex flex-col items-center justify-center gap-4">

            {/* "Cambia colore" label */}
            <motion.span
              className="text-[9px] font-mono tracking-[0.28em] text-white/40 uppercase"
              initial={{ opacity: 0 }}
              animate={textDone ? { opacity: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              Cambia colore
            </motion.span>

            {/* Vinyl image container */}
            <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: '260px', height: '260px' }}>
              {/* Glow ring */}
              <div className="absolute inset-0 rounded-full pointer-events-none" style={{
                background: 'radial-gradient(ellipse at center, rgba(88,196,236,0.12) 0%, transparent 70%)',
                filter: 'blur(18px)',
              }} />

              {/* Vinyl image — key triggers re-animate on color change */}
              <motion.div
                key={selectedVinyl}
                style={{ x: bottleX, y: bottleY }}
                initial={{ opacity: 0, scale: 0.85, filter: 'blur(12px)' }}
                animate={textDone ? { opacity: 1, scale: 1, filter: 'blur(0px)' } : {}}
                transition={{ duration: selectedVinyl === '/vinile-finale.png' ? 2.2 : 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <img
                  src={selectedVinyl}
                  alt="Navi Voice Agent"
                  className="w-[200px] h-[200px] object-contain rounded-full select-none"
                  style={{ filter: 'drop-shadow(0 0 28px rgba(88,196,236,0.25))' }}
                />
              </motion.div>
            </div>

            {/* Color swatches */}
            <motion.div
              className="flex flex-wrap justify-center gap-2 max-w-[240px]"
              initial={{ opacity: 0, y: 8 }}
              animate={textDone ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.7 }}
            >
              {VINYL_COLORS.map((src) => (
                <motion.button
                  key={src}
                  onClick={() => setSelectedVinyl(src)}
                  onMouseDown={playClick}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.92 }}
                  className="relative flex-shrink-0 rounded-full overflow-hidden transition-all"
                  style={{
                    width: 28, height: 28,
                    border: selectedVinyl === src
                      ? '2px solid rgba(88,196,236,0.8)'
                      : '2px solid rgba(255,255,255,0.12)',
                    boxShadow: selectedVinyl === src
                      ? '0 0 8px rgba(88,196,236,0.4)'
                      : 'none',
                  }}
                >
                  <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />
                </motion.button>
              ))}
            </motion.div>

          </div>

          <div className="flex flex-col gap-9 items-start flex-shrink-0 w-[120px] md:w-[150px] relative z-10">
            {rightVals.map((val, i) => (
              <ValueEntry key={val.label} val={val} textDone={textDone} delay={0.35 + i * 0.32} />
            ))}
          </div>
        </div>
      </div>

      {/* Capability chips — flex row below grid, all visible, no overlap */}
      {textDone && (
        <div className="flex flex-wrap justify-center gap-3 mt-12">
          {[
            '"What does Navi do?"',
            '"Which languages?"',
            '"How fast is it?"',
            '"Can I see a demo?"',
            '"How do I deploy?"',
            '"What\'s the price?"',
          ].map((text, i) => (
            <motion.button
              key={text}
              onClick={() => onChipClick?.(text.replace(/^"|"$/g, ''))}
              onMouseDown={playClick}
              className="text-[10px] font-mono text-white/60 border border-white/15 rounded-full px-3 py-[5px] bg-white/[0.04] backdrop-blur-sm whitespace-nowrap cursor-pointer hover:border-white/30 hover:text-white/80 hover:bg-white/[0.08] transition-all duration-200"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              {text}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [lang, setLang] = useState('en');
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [selectedVinyl, setSelectedVinyl] = useState('/vinile-finale.png');
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [showFloatingBtn, setShowFloatingBtn] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState(null);
  const [consentGranted, setConsentGranted] = useState(() => typeof document !== 'undefined' && hasConsent());
  const { scrollY } = useScroll();
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  // Unlock AudioContext on first user gesture (capture phase = fires before any element handler)
  useEffect(() => {
    const unlock = () => {
      try {
        if (!window.__naviAC) window.__naviAC = new (window.AudioContext || window.webkitAudioContext)();
        window.__naviAC.resume().catch(() => {});
      } catch { /* AudioContext unavailable — ignore */ }
      document.removeEventListener('click',      unlock, true);
      document.removeEventListener('keydown',    unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };
    document.addEventListener('click',      unlock, true);
    document.addEventListener('keydown',    unlock, true);
    document.addEventListener('touchstart', unlock, true);
    return () => {
      document.removeEventListener('click',      unlock, true);
      document.removeEventListener('keydown',    unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };
  }, []);

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      setShowFloatingBtn(latest > 300);
    });
  }, [scrollY]);

  // Navi starts only from an explicit user action.
  useEffect(() => {
    if (isVoiceActive) autoStartedRef.current = true;
  }, [isVoiceActive]);

  const heroVinylOpacity = useTransform(scrollY, [0, 350], [1, 0]);
  const heroVinylScale = useTransform(scrollY, [0, 350], [1, 0.85]);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothMouseX = useSpring(mouseX, { stiffness: 30, damping: 15 });
  const smoothMouseY = useSpring(mouseY, { stiffness: 30, damping: 15 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      mouseX.set(-(e.clientX / window.innerWidth - 0.5) * 60);
      mouseY.set(-(e.clientY / window.innerHeight - 0.5) * 60);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      <div className="bg-[#06060a] text-white min-h-screen font-sans overflow-x-hidden selection:bg-white/20 relative">

        {/* GLOBAL SEAMLESS BACKGROUND */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <motion.div
            className="absolute inset-[-10%] w-[120%] h-[120%]"
            animate={{ scale: [1, 1.05, 1], x: [0, -20, 20, 0], y: [0, 15, -15, 0] }}
            transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          >
            <motion.div
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: 'url(/liquid_waves_bg.png)',
                x: smoothMouseX,
                y: smoothMouseY,
                filter: VINYL_FILTERS[selectedVinyl] ?? 'none',
                transition: 'filter 0.9s ease-in-out',
              }}
            />
          </motion.div>
          <div className="absolute inset-0 bg-[#06060a]/68 mix-blend-multiply" />
        </div>

        <div className="relative z-10 flex flex-col w-full">

          {/* ========================================================= */}
          {/* SECTION 1: HERO */}
          {/* ========================================================= */}
          <section className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
            <div className="container mx-auto px-6 relative z-10 w-full h-full flex items-center mt-20">
              <div className="max-w-5xl">
                <motion.h1
                  initial={{ opacity: 0, y: 50, filter: 'blur(15px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 1.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="text-6xl sm:text-7xl md:text-[8rem] font-bold tracking-tight leading-[0.95] text-white mb-8 drop-shadow-2xl"
                >
                  Your website<br />Can speak.
                </motion.h1>
              </div>
            </div>

            {/* Vinyl Button */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1.2, delay: 1, ease: [0.16, 1, 0.3, 1] }}
              style={{ opacity: heroVinylOpacity, scale: heroVinylScale }}
              className="absolute right-8 md:right-32 top-[40%] -translate-y-1/2 z-20 hidden md:flex items-center gap-6"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-white/70">try it</span>
                <div className="w-12 h-[1px] bg-white/30" />
              </div>

              <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
                {isAgentSpeaking && <FrequencyRing vinylSize={220} barCount={24} color="rgba(88,196,236,0.55)" />}
                <motion.img
                  src={selectedVinyl}
                  alt="Vinyl"
                  onClick={() => setIsVoiceActive(true)}
                  onMouseDown={playClick}
                  whileHover={{ scale: 1.04, rotate: 8 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 18 }}
                  className="absolute w-[220px] h-[220px] object-contain cursor-pointer select-none rounded-full"
                  style={{ filter: 'drop-shadow(0 0 32px rgba(80,160,255,0.18))' }}
                />
              </div>
            </motion.div>
          </section>

          {/* ========================================================= */}
          {/* SECTION 2A: THE PROBLEM */}
          {/* ========================================================= */}
          <section id="problem" className="relative w-full py-40 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06060a]/20 to-transparent pointer-events-none" />
            <div className="container mx-auto px-6 lg:px-24 relative z-10">
              <FadeUp>
                <span className="text-xs font-mono tracking-[0.2em] text-white/50 uppercase block mb-10">
                  [ THE PROBLEM ]
                </span>
              </FadeUp>
              <FadeUp delay={0.1}>
                <h2 className="text-5xl md:text-7xl font-semibold tracking-tight mb-20 max-w-5xl leading-[1.1] text-white drop-shadow-lg">
                  People visit.
                </h2>
              </FadeUp>
              <StaggerContainer className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-32 max-w-6xl">
                <StaggerItem>
                  <p className="text-white/80 text-xl leading-relaxed font-light mb-6">
                    Every day, millions land on a website with a question. They scroll. They search. They find information buried in pages they never knew existed. Or worse, they find nothing at all. They leave.
                  </p>
                  <p className="text-white/80 text-xl leading-relaxed font-light">
                    It is not a content problem. It is a guidance problem. Websites speak at visitors. Nobody speaks with them.
                  </p>
                </StaggerItem>
                <StaggerItem>
                  <h3 className="text-4xl md:text-5xl font-semibold tracking-tight text-white leading-tight" style={{ marginBottom: '2.8rem' }}>
                    <span className="relative inline-block" style={{ transform: 'rotate(-4deg)', display: 'inline-block' }}>
                      They!
                      <motion.svg
                        className="absolute left-[-6px] w-[calc(100%+12px)]"
                        style={{ bottom: '-26px', overflow: 'visible' }}
                        height="30"
                        viewBox="0 0 140 30"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, margin: '-60px 0px' }}
                      >
                        {/* Line 1 — thick, bold first stroke */}
                        <motion.path
                          d="M1,9 C16,5 34,14 58,9 C82,4 100,13 122,7 C131,5 137,10 139,8"
                          stroke="white"
                          strokeWidth="6"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          variants={{
                            hidden: { pathLength: 0, opacity: 0, filter: 'drop-shadow(0 0 0px rgba(255,255,255,0))' },
                            visible: {
                              pathLength: 1,
                              opacity: [0, 1, 1, 0.88],
                              filter: [
                                'drop-shadow(0 0 0px rgba(255,255,255,0))',
                                'drop-shadow(0 0 14px rgba(255,255,255,0.95))',
                                'drop-shadow(0 0 14px rgba(255,255,255,0.95))',
                                'drop-shadow(0 0 2px rgba(255,255,255,0.2))',
                              ],
                              transition: {
                                pathLength: { duration: 0.58, ease: [0.4, 0, 0.2, 1] },
                                opacity: { duration: 0.9, times: [0, 0.5, 0.7, 1] },
                                filter: { duration: 1.1, times: [0, 0.5, 0.65, 1] },
                              }
                            }
                          }}
                        />
                      </motion.svg>
                    </span>
                  </h3>
                  <p className="text-white/80 text-xl leading-relaxed font-light mb-6">
                    They arrive with questions. They search for answers buried three clicks deep. They find silence. They never return.
                  </p>
                  <p className="text-white/80 text-xl leading-relaxed font-light">
                    Navi was built for them. A voice that lives inside your site, knowing every page, every product, every detail, and speaks the moment they arrive. Not when they ask. From the first second.
                  </p>
                </StaggerItem>
              </StaggerContainer>
            </div>
          </section>

          {/* ========================================================= */}
          {/* SECTION 2B: THE PROCESS */}
          {/* ========================================================= */}
          <section id="howitworks" className="relative w-full py-40 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-[#06060a]/20 via-transparent to-transparent pointer-events-none" />
            <div className="container mx-auto px-6 lg:px-24 relative z-10 flex flex-col items-center">
              <div className="w-full max-w-5xl mb-32 text-left">
                <FadeUp>
                  <span className="text-xs font-mono tracking-[0.2em] text-white/70 uppercase block mb-10 drop-shadow-md">
                    [ THE PROCESS ]
                  </span>
                </FadeUp>
                <FadeUp delay={0.1}>
                  <h2 className="text-5xl md:text-7xl font-semibold tracking-tight mb-24 text-white drop-shadow-lg">
                    deploy.
                  </h2>
                </FadeUp>

                <div className="space-y-24">
                  <motion.div
                    className="flex flex-col md:flex-row gap-6 md:gap-16 items-start"
                    initial={{ opacity: 0, x: -70, filter: 'blur(8px)' }}
                    whileInView={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="text-lg font-mono text-white/70 mt-1">01</span>
                    <div>
                      <h3 className="text-2xl font-semibold text-white mb-4 drop-shadow-md">Learn</h3>
                      <p className="text-white/90 text-xl font-medium leading-relaxed max-w-2xl drop-shadow-sm">
                        Navi ingests your site: pages, products, documentation, brand voice. It becomes a complete expert on everything you have built, before speaking a single word.
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    className="flex flex-col md:flex-row gap-6 md:gap-16 items-start"
                    initial={{ opacity: 0, x: -70, filter: 'blur(8px)' }}
                    whileInView={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="text-lg font-mono text-white/70 mt-1">02</span>
                    <div>
                      <h3 className="text-2xl font-semibold text-white mb-4 drop-shadow-md">Speak</h3>
                      <p className="text-white/90 text-xl font-medium leading-relaxed max-w-2xl drop-shadow-sm">
                        Define tone, language, persona. Navi adopts your voice and carries it across every conversation, in 12 languages, at any hour, on any page.
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    className="flex flex-col md:flex-row gap-6 md:gap-16 items-start"
                    initial={{ opacity: 0, x: -70, filter: 'blur(8px)' }}
                    whileInView={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    viewport={{ once: true, margin: "-80px" }}
                    transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <span className="text-lg font-mono text-white/70 mt-1">03</span>
                    <div>
                      <h3 className="text-2xl font-semibold text-white mb-4 drop-shadow-md">Guide</h3>
                      <p className="text-white/90 text-xl font-medium leading-relaxed max-w-2xl drop-shadow-sm">
                        Navi accompanies every visitor in real time: answering, explaining, directing. Not once they ask. From the moment they arrive.
                      </p>
                    </div>
                  </motion.div>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================= */}
          {/* SECTION 3: THE PRODUCT */}
          {/* ========================================================= */}
          <section id="product" className="relative w-full min-h-screen overflow-hidden flex items-center">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06060a]/15 to-transparent pointer-events-none" />
            <div className="relative z-10 w-full py-20">
              <AgentSection
                onChipClick={(q) => { setPendingQuestion(q); setIsVoiceActive(true); }}
                selectedVinyl={selectedVinyl}
                setSelectedVinyl={setSelectedVinyl}
              />
            </div>
          </section>

          {/* ========================================================= */}
          {/* SECTION 3B: SEE IT IN ACTION */}
          {/* ========================================================= */}
          <section id="demo" className="relative w-full py-40 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06060a]/30 to-transparent pointer-events-none" />
            <div className="container mx-auto px-6 lg:px-24 relative z-10">
              <FadeUp>
                <span className="text-xs font-mono tracking-[0.2em] text-white/50 uppercase block mb-10">
                  [ SEE IT IN ACTION ]
                </span>
              </FadeUp>
              <FadeUp delay={0.1}>
                <h2 className="text-5xl md:text-7xl font-semibold tracking-tight mb-20 text-white drop-shadow-lg">
                  demo.
                </h2>
              </FadeUp>
              <FadeUp delay={0.2}>
                <BrowserMockup vinyl={selectedVinyl} />
              </FadeUp>
            </div>
          </section>

          {/* ========================================================= */}
          {/* SECTION 3C: PRICING */}
          {/* ========================================================= */}
          <section id="pricing" className="relative w-full py-40 overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#06060a]/20 to-transparent pointer-events-none" />
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(88,140,255,0.06) 0%, transparent 70%)', filter: 'blur(40px)' }} />

            <div className="container mx-auto px-6 lg:px-24 relative z-10">
              <FadeUp>
                <span className="text-xs font-mono tracking-[0.2em] text-white/50 uppercase block mb-10">
                  [ PRICING ]
                </span>
              </FadeUp>
              <FadeUp delay={0.1}>
                <h2 className="text-5xl md:text-7xl font-semibold tracking-tight mb-6 text-white drop-shadow-lg">
                  plans.
                </h2>
              </FadeUp>
              <FadeUp delay={0.15}>
                <p className="text-white/50 text-lg font-light mb-20 max-w-xl">
                  Sessions, not counted minutes. Your agent never disappears mid-month. Free plan renews every month — forever.
                </p>
              </FadeUp>

              {/* ── Plan cards ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16 max-w-6xl mx-auto">

                {/* FREE */}
                <FadeUp delay={0.2}>
                  <motion.div
                    whileHover={{ y: -4, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
                    className="flex flex-col items-center text-center rounded-2xl p-6 border border-white/[0.07] h-full"
                    style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(12px)' }}
                  >
                    <span className="text-[9px] font-mono tracking-[0.22em] uppercase text-white/25 mb-3">Renews monthly</span>
                    <div className="rounded-xl px-5 py-3 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="text-3xl font-bold text-white">€0</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">Free</h3>
                    <p className="text-white/30 text-[10px] font-mono mb-1">50 sessions / mo · 1 agent</p>
                    <p className="text-white/25 text-[9px] font-mono mb-6">Forever. Never expires.</p>
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onMouseDown={playClick}
                      onClick={() => setCheckoutPlan('free')}
                      className="w-full py-2.5 rounded-full text-sm font-sans font-medium tracking-[0.08em] text-white transition-all mt-auto"
                      style={{ background: 'rgba(8,8,10,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >Start free</motion.button>
                  </motion.div>
                </FadeUp>

                {/* STARTER */}
                <FadeUp delay={0.25}>
                  <motion.div
                    whileHover={{ y: -4, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
                    className="flex flex-col items-center text-center rounded-2xl p-6 border border-white/[0.07] h-full"
                    style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(12px)' }}
                  >
                    <span className="text-[9px] font-mono tracking-[0.22em] uppercase text-white/25 mb-3">For solo sites</span>
                    <div className="rounded-xl px-5 py-3 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="text-3xl font-bold text-white">€49</span>
                      <span className="text-white/30 text-[10px] font-mono ml-1">/mo</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">Starter</h3>
                    <p className="text-white/30 text-[10px] font-mono mb-1">200 sessions / mo · 1 agent</p>
                    <p className="text-white/25 text-[9px] font-mono mb-6">vs Foyer $63 · −22%</p>
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onMouseDown={playClick}
                      onClick={() => setCheckoutPlan('starter')}
                      className="w-full py-2.5 rounded-full text-sm font-sans font-medium tracking-[0.08em] text-white transition-all mt-auto"
                      style={{ background: 'rgba(8,8,10,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >Open dashboard</motion.button>
                  </motion.div>
                </FadeUp>

                {/* BUSINESS — Most Popular */}
                <FadeUp delay={0.3}>
                  <div className="relative h-full">
                    <div className="absolute -inset-[1px] rounded-2xl pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(88,140,255,0.18) 50%, rgba(255,255,255,0.06) 100%)' }} />
                    <motion.div
                      whileHover={{ y: -4, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
                      className="relative flex flex-col items-center text-center rounded-2xl p-6 border border-transparent h-full"
                      style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(12px)' }}
                    >
                      <span className="text-[9px] font-mono tracking-[0.22em] uppercase mb-3" style={{ color: 'rgba(130,180,255,0.7)' }}>★ Most Popular</span>
                      <div className="rounded-xl px-5 py-3 mb-4" style={{ background: 'rgba(88,140,255,0.07)', border: '1px solid rgba(88,140,255,0.16)' }}>
                        <span className="text-3xl font-bold text-white">€99</span>
                        <span className="text-white/30 text-[10px] font-mono ml-1">/mo</span>
                      </div>
                      <h3 className="text-base font-semibold text-white mb-1">Business</h3>
                      <p className="text-white/30 text-[10px] font-mono mb-1">600 sessions / mo · 3 agents</p>
                      <p className="text-white/25 text-[9px] font-mono mb-6">Multi-site included</p>
                      <motion.button
                        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                        onMouseDown={playClick}
                        onClick={() => setCheckoutPlan('business')}
                        className="w-full py-2.5 rounded-full text-sm font-sans font-medium tracking-[0.08em] text-white transition-all mt-auto"
                        style={{ background: 'rgba(8,8,10,0.97)', boxShadow: '0 0 0 1px rgba(255,255,255,0.11) inset' }}
                      >Open dashboard</motion.button>
                    </motion.div>
                  </div>
                </FadeUp>

                {/* AGENCY */}
                <FadeUp delay={0.35}>
                  <motion.div
                    whileHover={{ y: -4, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
                    className="flex flex-col items-center text-center rounded-2xl p-6 border border-white/[0.07] h-full"
                    style={{ background: 'rgba(255,255,255,0.025)', backdropFilter: 'blur(12px)' }}
                  >
                    <span className="text-[9px] font-mono tracking-[0.22em] uppercase text-white/25 mb-3">White-label</span>
                    <div className="rounded-xl px-5 py-3 mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="text-3xl font-bold text-white">€199</span>
                      <span className="text-white/30 text-[10px] font-mono ml-1">/mo</span>
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">Agency</h3>
                    <p className="text-white/30 text-[10px] font-mono mb-1">1,500 sessions / mo · 10 agents</p>
                    <p className="text-white/25 text-[9px] font-mono mb-6">Session packs available</p>
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onMouseDown={playClick}
                      onClick={() => setCheckoutPlan('agency')}
                      className="w-full py-2.5 rounded-full text-sm font-sans font-medium tracking-[0.08em] text-white transition-all mt-auto"
                      style={{ background: 'rgba(8,8,10,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >Open dashboard</motion.button>
                  </motion.div>
                </FadeUp>

              </div>

              {/* ── Comparison table ── */}
              <FadeUp delay={0.5}>
                <div className="max-w-4xl mx-auto mb-16 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.015)' }}>
                  {/* Header */}
                  <div className="grid grid-cols-5 px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                    <div />
                    {['Free', 'Starter', 'Business', 'Agency'].map(n => (
                      <div key={n} className="text-center text-[10px] font-mono tracking-[0.18em] uppercase text-white/35">{n}</div>
                    ))}
                  </div>
                  {/* Rows */}
                  {[
                    { label: 'Sessions',           free: '50 / mo',  starter: '200 / mo', business: '600 / mo', agency: '1,500 / mo' },
                    { label: 'Renews monthly',     free: '✓',         starter: '✓',         business: '✓',         agency: '✓' },
                    { label: 'Agents',             free: '1',         starter: '1',         business: '3',         agency: '10' },
                    { label: 'Pages indexed',      free: '50',        starter: '500',       business: '2,000',     agency: '10,000' },
                    { label: 'Languages',          free: '1',         starter: '30+',       business: '30+',       agency: '30+' },
                    { label: 'Watermark',          free: '✓',         starter: '—',         business: '—',         agency: '—' },
                    { label: 'Analytics',          free: '—',         starter: '✓',         business: '✓',         agency: '✓' },
                    { label: 'Custom widget',      free: '—',         starter: '✓',         business: '✓',         agency: '✓' },
                    { label: 'Lead notifications', free: '—',         starter: '✓',         business: '✓',         agency: '✓' },
                    { label: 'Multi-site',         free: '—',         starter: '—',         business: '✓',         agency: '✓' },
                    { label: 'White-label',        free: '—',         starter: '—',         business: '—',         agency: '✓' },
                    { label: 'Session packs',      free: '—',         starter: '—',         business: '—',         agency: '✓' },
                    { label: 'Priority support',   free: '—',         starter: '—',         business: '✓',         agency: '✓' },
                  ].map((row, i, arr) => (
                    <div key={row.label} className="grid grid-cols-5 px-6 py-3" style={{ borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <span className="text-[11px] font-mono text-white/35">{row.label}</span>
                      {[row.free, row.starter, row.business, row.agency].map((val, j) => (
                        <span key={j} className={`text-center text-[11px] font-mono ${val === '—' ? 'text-white/15' : val === '✓' ? 'text-white/40' : 'text-white/65'}`}>
                          {val}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </FadeUp>

              {/* ── Ask Navi CTA ── */}
              <FadeUp delay={0.6}>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <p className="text-white/35 text-sm font-light">Not sure which plan fits your project?</p>
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                    onMouseDown={playClick}
                    onClick={() => { setPendingQuestion('Which Navi plan is right for me and my project?'); setIsVoiceActive(true); }}
                    className="flex items-center gap-2 px-5 py-2 rounded-full text-sm font-sans font-medium text-white/80 flex-shrink-0 transition-all"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    Ask Navi
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5h7M6 2.5l3 3-3 3" stroke="rgba(255,255,255,0.5)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.button>
                </div>
              </FadeUp>

            </div>
          </section>


          {/* ========================================================= */}
          {/* MARQUEE: TRUSTED BY */}
          {/* ========================================================= */}
          {(() => {
            const SITES = [
              { name: 'Arco Studio', cat: 'Agency' },
              { name: 'Vivid', cat: 'E-commerce' },
              { name: 'Forma', cat: 'Design' },
              { name: 'Helix', cat: 'SaaS' },
              { name: 'Bloom', cat: 'Marketing' },
              { name: 'Lune', cat: 'Retail' },
              { name: 'Drift', cat: 'Fintech' },
              { name: 'Nova', cat: 'Tech' },
              { name: 'Pulse', cat: 'AI' },
              { name: 'Echo', cat: 'Media' },
              { name: 'Crest', cat: 'Consulting' },
              { name: 'Flux', cat: 'Studio' },
            ];
            const row1 = [...SITES, ...SITES];
            const row2 = [...SITES.slice(6), ...SITES.slice(0, 6), ...SITES.slice(6), ...SITES.slice(0, 6)];

            const SiteCard = ({ name, cat }) => (
              <div
                className="flex items-center gap-3 flex-shrink-0 select-none"
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '14px',
                  padding: '10px 18px 10px 12px',
                  marginRight: '12px',
                }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                    {name[0]}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 500, lineHeight: 1.2, letterSpacing: '0.01em' }}>{name}</div>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 2 }}>{cat}</div>
                </div>
              </div>
            );

            return (
              <div
                className="relative w-full py-16 pb-40 sm:pb-56"
                style={{
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                {/* Black fade vignette — moved here from acquire section */}
                <div
                  className="absolute inset-x-0 bottom-0 h-56 sm:h-64 pointer-events-none"
                  style={{
                    background: 'linear-gradient(to top, #040406 0%, rgba(4,4,6,0.8) 30%, transparent 100%)',
                  }}
                />

                {/* Constrained track — mask-image fade at edges, no overlay divs */}
                <div
                  className="relative mx-auto"
                  style={{
                    maxWidth: '860px',
                    overflow: 'hidden',
                    maskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                  }}
                >
                  {/* Row 1 — scrolls left */}
                  <div className="overflow-hidden mb-3">
                    <motion.div
                      className="flex"
                      animate={{ x: ['0%', '-50%'] }}
                      transition={{ duration: 38, ease: 'linear', repeat: Infinity }}
                      style={{ willChange: 'transform' }}
                    >
                      {row1.map((s, i) => <SiteCard key={i} {...s} />)}
                    </motion.div>
                  </div>

                  {/* Row 2 — scrolls right */}
                  <div className="overflow-hidden">
                    <motion.div
                      className="flex"
                      animate={{ x: ['-50%', '0%'] }}
                      transition={{ duration: 44, ease: 'linear', repeat: Infinity }}
                      style={{ willChange: 'transform' }}
                    >
                      {row2.map((s, i) => <SiteCard key={i} {...s} />)}
                    </motion.div>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>

        {/* FLOATING VOICE BUTTON — sits just above footer drawer handle (56px) */}
        <div className="fixed bottom-14 sm:bottom-16 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <AnimatePresence>
            {showFloatingBtn && !isVoiceActive && (
              <motion.button
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 50, scale: 0.9 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setIsVoiceActive(true)}
                onMouseDown={playClick}
                className="pointer-events-auto flex items-center gap-3 px-6 py-3 bg-[#a6b1b6] rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] hover:bg-[#b0bdc2] transition-colors"
              >
                <span className="text-[13px] font-sans text-[#1a1a1a] font-bold tracking-wide uppercase px-1">
                  Talk to Navi
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* FLOATING VINYL — bottom-right, follows after hero */}
        <AnimatePresence>
          {showFloatingBtn && (
            <motion.div
              onClick={() => setIsVoiceActive(true)}
              onMouseDown={playClick}
              initial={{ opacity: 0, x: 80, y: 80, scale: 0.6, rotate: -20 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, x: 80, y: 80, scale: 0.6, rotate: -20 }}
              transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              whileHover={{ scale: 1.07, rotate: 8 }}
              whileTap={{ scale: 0.95 }}
              className="fixed bottom-20 right-8 z-40 hidden md:flex items-center justify-center cursor-pointer"
              style={{ width: 150, height: 150 }}
            >
              <div className="relative flex items-center justify-center" style={{ width: 110, height: 110 }}>
                {isAgentSpeaking && <FrequencyRing vinylSize={110} barCount={18} />}
                <img
                  src={selectedVinyl}
                  alt="Vinyl"
                  className="absolute w-[110px] h-[110px] object-contain select-none rounded-full"
                  style={{ filter: 'drop-shadow(0 0 24px rgba(80,160,255,0.22))' }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CHECKOUT MODAL */}
        <AnimatePresence>
          {checkoutPlan && (
            <CheckoutModal plan={checkoutPlan} onClose={() => setCheckoutPlan(null)} />
          )}
        </AnimatePresence>

        {/* FOOTER PULL-DRAWER — only after consent (avoids overlap with cookie banner) */}
        {consentGranted && <Footer vinyl={selectedVinyl} />}

        {/* COOKIE CONSENT BANNER */}
        <CookieBanner vinyl={selectedVinyl} onAccept={() => setConsentGranted(true)} />

        {/* GLOBAL VOICE AGENT WIDGET */}
        <VoiceAgent
          isActive={isVoiceActive}
          onClose={() => { setIsVoiceActive(false); setPendingQuestion(null); }}
          lang={lang}
          setActiveSection={() => { }}
          currentSection="home"
          pendingQuestion={pendingQuestion}
          onPendingQuestionHandled={() => setPendingQuestion(null)}
          onSpeakingChange={setIsAgentSpeaking}
          selectedVinyl={selectedVinyl}
        />
      </div>
    </LanguageContext.Provider>
  );
};

export default App;
