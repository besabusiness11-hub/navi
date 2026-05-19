import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { Send, Check, X } from 'lucide-react';

const FB_KEY = 'navi_feedback_log';

const Footer = ({ vinyl = '/vinile-finale.png' }) => {
  const [open, setOpen] = useState(false);
  const y = useMotionValue(0);

  // ── Feedback form state ─────────────────────────────────────────
  const [rating, setRating] = useState(0);
  const [hoverStar, setHoverStar] = useState(0);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmit] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submitFeedback = async (e) => {
    e.preventDefault();
    if (!message.trim() || rating === 0) {
      setError('Please rate and leave a message.');
      return;
    }
    setError('');
    setSubmit(true);
    const payload = {
      rating,
      email: email.trim(),
      message: message.trim(),
      page: window.location.href,
      ts: Date.now(),
    };
    try {
      // Local persistence (always)
      try {
        const log = JSON.parse(localStorage.getItem(FB_KEY) || '[]');
        log.push(payload);
        localStorage.setItem(FB_KEY, JSON.stringify(log.slice(-50)));
      } catch { /* localStorage unavailable — ignore */ }
      // Optional backend POST — silently ignored if endpoint missing
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => { });
      setSent(true);
      setRating(0); setEmail(''); setMessage('');
      setTimeout(() => setSent(false), 4000);
    } catch (err) {
      setError('Send failed. Try again.');
    } finally {
      setSubmit(false);
    }
  };

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Lock background scroll when open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Auto-open when user scrolls near page bottom (past marquee section)
  useEffect(() => {
    if (open) return;
    let lastY = window.scrollY;
    const onScroll = () => {
      const sy = window.scrollY;
      const winH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      const distFromBottom = docH - (sy + winH);
      // Trigger only when scrolling DOWN and near bottom
      if (distFromBottom < 80 && sy > lastY) setOpen(true);
      lastY = sy;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [open]);

  return (
    <>
      {/* BACKDROP — only when open */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* DRAWER */}
      <motion.aside
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.18}
        dragMomentum={false}
        style={{ y, height: 'min(78vh, 640px)' }}
        onDragEnd={(_, info) => {
          // Snap based on velocity / offset → never stops mid-way
          if (open) {
            if (info.offset.y > 80 || info.velocity.y > 500) setOpen(false);
            else y.set(0);
          } else {
            if (info.offset.y < -80 || info.velocity.y < -500) setOpen(true);
            else y.set(0);
          }
        }}
        animate={open ? 'open' : 'closed'}
        variants={{
          closed: { y: 'calc(100% - 56px)' },
          open: { y: 0 },
        }}
        transition={{ type: 'spring', damping: 32, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-[160] touch-none"
      >
        {/* Background panel — fades in only when open, transparent when closed */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          variants={{
            closed: { opacity: 0 },
            open: { opacity: 1 },
          }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: 'linear-gradient(180deg, rgba(10,12,18,0.98) 0%, rgba(4,4,6,1) 100%)',
            backdropFilter: 'blur(28px)',
            WebkitBackdropFilter: 'blur(28px)',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            boxShadow: '0 -24px 60px rgba(0,0,0,0.6)',
          }}
        />

        {/* HANDLE — minimal drag pill only, transparent bg */}
        <button
          onClick={() => setOpen(v => !v)}
          className="relative w-full h-[56px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none group bg-transparent"
          aria-label={open ? 'Close footer' : 'Open footer'}
        >
          <div className="w-12 h-1 rounded-full bg-white/35 group-hover:bg-white/60 transition-colors duration-300 shadow-[0_2px_8px_rgba(0,0,0,0.5)]" />
        </button>

        {/* CONTENT — visible when open */}
        <div className="relative overflow-y-auto h-[calc(100%-56px)] px-5 sm:px-10 lg:px-16 pb-10">
          <div className="max-w-3xl mx-auto pt-6 sm:pt-10 text-center">
            {/* Mini vinyl */}
            <motion.div
              className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full overflow-hidden mb-6 sm:mb-8 relative"
              animate={open ? { rotate: 360 } : {}}
              transition={{ duration: 16, ease: 'linear', repeat: Infinity }}
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset' }}
            >
              <img src={vinyl} alt="Navi" className="w-full h-full object-cover" />
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle at 50% 50%, transparent 0%, transparent 32%, rgba(0,0,0,0.6) 60%)' }}
              />
            </motion.div>

            <span className="text-[10px] sm:text-xs font-mono tracking-[0.22em] text-white/50 uppercase block mb-4 sm:mb-6">

            </span>

            <h2 className="text-3xl sm:text-5xl md:text-6xl font-semibold tracking-tight mb-4 sm:mb-6 text-white">
              feedback.
            </h2>

            <p className="text-white/65 text-sm sm:text-base leading-relaxed font-light mb-8 sm:mb-10 max-w-xl mx-auto">
              Help us make Navi better. Every opinion counts.
            </p>

            {/* FEEDBACK FORM */}
            <form onSubmit={submitFeedback} className="max-w-md mx-auto text-left">
              {/* Stars */}
              <div className="flex items-center justify-center gap-1.5 mb-6">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHoverStar(n)}
                    onMouseLeave={() => setHoverStar(0)}
                    className="text-2xl sm:text-3xl transition-all duration-200 hover:scale-110 cursor-pointer select-none"
                    style={{
                      color: (hoverStar || rating) >= n ? '#D4AF37' : 'rgba(255,255,255,0.18)',
                      textShadow: (hoverStar || rating) >= n ? '0 0 12px rgba(212,175,55,0.45)' : 'none',
                    }}
                    aria-label={`${n} stars`}
                  >
                    ★
                  </button>
                ))}
              </div>

              {/* Email */}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full px-4 py-3 mb-3 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white/85 placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/[0.06] transition-all"
              />

              {/* Message */}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What do you think of Navi? What would you improve?"
                rows={4}
                required
                className="w-full px-4 py-3 mb-4 bg-white/[0.04] border border-white/10 rounded-xl text-sm text-white/85 placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/[0.06] transition-all resize-none"
              />

              {error && (
                <p className="text-[11px] text-red-400/80 mb-3 text-center">{error}</p>
              )}

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={submitting || sent}
                whileHover={!submitting && !sent ? { scale: 1.03 } : {}}
                whileTap={!submitting && !sent ? { scale: 0.97 } : {}}
                className={`w-full inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full font-mono text-[11px] sm:text-[12px] tracking-[0.2em] uppercase font-bold transition-all ${sent
                  ? 'bg-[#5ea236] text-white'
                  : submitting
                    ? 'bg-white/30 text-white/60 cursor-wait'
                    : 'bg-white text-[#0a0a0e] hover:bg-[#e8e8e8] cursor-pointer shadow-[0_10px_30px_rgba(255,255,255,0.12)]'
                  }`}
              >
                {sent ? (
                  <>
                    <Check className="w-4 h-4" strokeWidth={3} />
                    Thanks!
                  </>
                ) : submitting ? (
                  <>Sending…</>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" strokeWidth={2.5} />
                    Send feedback
                  </>
                )}
              </motion.button>
            </form>

            {/* Footer meta */}
            <div className="mt-12 sm:mt-16 pt-6 sm:pt-8 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-mono tracking-[0.18em] uppercase text-white/30">
              <span>© {new Date().getFullYear()} Navi · All rights reserved</span>
              <div className="flex items-center gap-4 sm:gap-6">
                <a href="mailto:hello@getnavi.dev" className="hover:text-white/70 transition-colors">Contact</a>
                <a href="#pricing" onClick={() => setOpen(false)} className="hover:text-white/70 transition-colors">Pricing</a>
                <a href="#product" onClick={() => setOpen(false)} className="hover:text-white/70 transition-colors">Product</a>
              </div>
            </div>
          </div>
        </div>

        {/* CLOSE X — top right when open */}
        <AnimatePresence>
          {open && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white/70" />
            </motion.button>
          )}
        </AnimatePresence>
      </motion.aside>
    </>
  );
};

export default Footer;
