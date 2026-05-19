import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const KEY = 'navi_consent';

const hasConsent = () =>
  document.cookie.split('; ').some(c => c.startsWith(KEY + '=true'));

const grantConsent = () => {
  document.cookie = `${KEY}=true; path=/; max-age=31536000; SameSite=Lax`;
};

const declineConsent = () => {
  document.cookie = `${KEY}=false; path=/; max-age=31536000; SameSite=Lax`;
};

const CookieBanner = ({ vinyl = '/vinile-finale.png', onAccept }) => {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!hasConsent()) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const handleAccept = () => {
    grantConsent();
    try {
      if (!window.__naviAC) window.__naviAC = new (window.AudioContext || window.webkitAudioContext)();
      window.__naviAC.resume().catch(() => {});
    } catch { /* AudioContext unavailable — ignore */ }
    setVisible(false);
    onAccept?.();
  };

  const handleDecline = () => {
    declineConsent();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.96 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-[300] w-[calc(100%-1.5rem)] max-w-xl px-2 pointer-events-auto"
        >
          <motion.div
            layout
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-2xl sm:rounded-[22px]"
            style={{
              background: 'linear-gradient(180deg, rgba(12,14,22,0.96) 0%, rgba(8,10,16,0.98) 100%)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.05) inset',
            }}
          >
            {/* COMPACT ROW */}
            <div className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4">
              {/* Mini vinyl */}
              <motion.div
                className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden flex-shrink-0"
                animate={{ rotate: 360 }}
                transition={{ duration: 18, ease: 'linear', repeat: Infinity }}
                style={{
                  boxShadow: '0 4px 18px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
                }}
              >
                <img src={vinyl} alt="Navi" className="w-full h-full object-cover" />
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'radial-gradient(circle at 50% 50%, transparent 0%, transparent 32%, rgba(0,0,0,0.6) 60%)' }}
                />
              </motion.div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="text-[9px] sm:text-[10px] font-mono tracking-[0.22em] text-white/35 uppercase mb-0.5">
                  Cookie & Voice
                </div>
                <p className="text-[12px] sm:text-[13px] text-white/75 font-light leading-snug">
                  Navi uses cookies to personalize your experience and enable the voice agent.
                </p>
              </div>

              {/* Accept button */}
              <button
                onClick={handleAccept}
                onMouseDown={(e) => e.preventDefault()}
                className="flex-shrink-0 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[11px] sm:text-[12px] font-sans font-bold text-[#0a0a0e] bg-white hover:bg-[#e8e8e8] active:scale-95 transition-all duration-200 cursor-pointer whitespace-nowrap tracking-wide"
                style={{ boxShadow: '0 4px 14px rgba(255,255,255,0.12)' }}
              >
                Accept
              </button>
            </div>

            {/* EXPANDABLE DETAILS */}
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-4 sm:px-5 pb-4 pt-1 border-t border-white/5">
                    <ul className="space-y-2 text-[11px] text-white/55 font-light leading-relaxed">
                      <li className="flex items-start gap-2">
                        <span className="text-white/30 mt-0.5">·</span>
                        <span><b className="text-white/75 font-medium">Essential</b> — session, language preferences, security.</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-white/30 mt-0.5">·</span>
                        <span><b className="text-white/75 font-medium">Voice Agent</b> — unlocks audio for Navi (one click = AudioContext enabled for the browser).</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-white/30 mt-0.5">·</span>
                        <span><b className="text-white/75 font-medium">Memory</b> — Navi remembers returning visitors for more natural conversations.</span>
                      </li>
                    </ul>
                    <button
                      onClick={handleDecline}
                      className="mt-4 text-[10px] font-mono tracking-[0.18em] text-white/35 hover:text-white/70 uppercase transition-colors"
                    >
                      Decline non-essential cookies
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toggle details */}
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-full py-1.5 text-[9px] sm:text-[10px] font-mono tracking-[0.2em] text-white/25 hover:text-white/55 uppercase transition-colors border-t border-white/5"
            >
              {expanded ? '— Hide details' : '+ Details & preferences'}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { hasConsent };
export default CookieBanner;
