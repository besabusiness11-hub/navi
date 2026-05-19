import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/* ─── site tokens ─────────────────────────────────────── */
const CYAN = '88,196,236';   // rgba accent

const PLANS = {
  free:     { label: 'Free',     price: '€0',   sub: '',    desc: '50 sessions/mo · 1 agent · renews every month forever' },
  starter:  { label: 'Starter',  price: '€49',  sub: '/mo', desc: '200 sessions/mo · 1 agent'                              },
  business: { label: 'Business', price: '€99',  sub: '/mo', desc: '600 sessions/mo · 3 agents · multi-site included'       },
  agency:   { label: 'Agency',   price: '€199', sub: '/mo', desc: '1,500 sessions/mo · 10 agents · white-label + packs'    },
};

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

/* ─── Vinyl logo mark ─────────────────────────────────── */
const NaviLogo = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
    <div style={{ position: 'relative', width: 36, height: 36 }}>
      <img
        src="/vinile-finale.png"
        alt="Navi"
        style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }}
      />
    </div>
    <span style={{
      fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em', color: 'white',
    }}>
      navi
    </span>
  </div>
);

/* ─── Static-label input (like reference) ────────────── */
const Field = ({ label, optional, type = 'text', value, onChange, placeholder, required, autoFocus }) => {
  const [focused, setFocused] = useState(false);

  return (
    <div>
      <label style={{
        display: 'block',
        fontSize: 13,
        fontWeight: 500,
        color: 'rgba(255,255,255,0.72)',
        marginBottom: 7,
      }}>
        {label}
        {optional && (
          <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.28)', marginLeft: 5 }}>
            (optional)
          </span>
        )}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          padding: '13px 16px',
          background: 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${focused
            ? `rgba(${CYAN},0.65)`
            : 'rgba(255,255,255,0.09)'}`,
          borderRadius: 10,
          color: 'white',
          fontSize: 15,
          fontFamily: 'inherit',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border 0.2s ease, box-shadow 0.2s ease',
          boxShadow: focused
            ? `0 0 0 3px rgba(${CYAN},0.08)`
            : 'none',
        }}
      />
    </div>
  );
};

/* ─── Modal ───────────────────────────────────────────── */
const CheckoutModal = ({ plan, onClose }) => {
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const p = PLANS[plan] ?? PLANS.free;

  const submit = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) { setError('Enter a valid email address.'); return; }
    setError('');
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/api/checkout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, name, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Server error');
      window.location.href = data.redirect;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {/* Full-screen overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(4,4,10,0.92)',
          backdropFilter: 'blur(22px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px 16px',
          fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
        }}
        onClick={onClose}
      >
        {/* Subtle cyan glow at center */}
        <div style={{
          position: 'absolute',
          top: '35%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 500, height: 350,
          background: `radial-gradient(ellipse, rgba(${CYAN},0.05) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 440,
            background: '#0c0c16',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 20,
            padding: '40px 36px 32px',
            boxShadow: `0 40px 100px rgba(0,0,0,0.7), 0 0 80px rgba(${CYAN},0.03)`,
          }}
        >
          {/* Close button */}
          <motion.button
            onClick={onClose}
            whileHover={{ background: 'rgba(255,255,255,0.1)', scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            style={{
              position: 'absolute', top: 14, right: 14,
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </motion.button>

          {/* Logo */}
          <div style={{ marginBottom: 28 }}>
            <NaviLogo />
          </div>

          {/* Title block */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{
              fontSize: 26, fontWeight: 700, color: 'white',
              letterSpacing: '-0.03em', marginBottom: 6,
            }}>
              {plan === 'free' ? 'Start for free' : 'Get started'}
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>
              {plan === 'free'
                ? 'Your API key will be sent to your email. Renews every month forever.'
                : `${p.label} plan · ${p.price}${p.sub} · ${p.desc}`}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="Name"
              optional
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
            />
            <Field
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yoursite.com"
              required
            />

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  fontSize: 12, color: 'rgba(255,90,90,0.85)',
                  marginTop: -6,
                }}
              >
                {error}
              </motion.p>
            )}

            {/* CTA */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={!loading ? {
                scale: 1.015,
                boxShadow: `0 8px 32px rgba(${CYAN},0.3)`,
              } : {}}
              whileTap={!loading ? { scale: 0.985 } : {}}
              style={{
                width: '100%',
                padding: '15px',
                marginTop: 4,
                borderRadius: 10,
                border: 'none',
                fontSize: 15,
                fontWeight: 700,
                fontFamily: 'inherit',
                letterSpacing: '-0.01em',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading
                  ? 'rgba(255,255,255,0.06)'
                  : `rgba(${CYAN},1)`,
                color: loading ? 'rgba(255,255,255,0.3)' : '#06060a',
                boxShadow: loading ? 'none' : `0 4px 22px rgba(${CYAN},0.22)`,
                transition: 'all 0.25s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading ? (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                    style={{ animation: 'cm-spin 1s linear infinite' }}>
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="rgba(255,255,255,0.6)" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Redirecting…
                </>
              ) : (
                plan === 'free'
                  ? 'Get free access →'
                  : 'Continue to payment →'
              )}
            </motion.button>
          </form>

          {/* Footer */}
          <div style={{ marginTop: 24, textAlign: 'center' }}>
            {plan === 'free' ? (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
                No credit card required
              </p>
            ) : (
              <p style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.18)',
                fontFamily: "'JetBrains Mono', monospace",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                <svg width="10" height="11" viewBox="0 0 10 11" fill="none">
                  <rect x="0.8" y="4.5" width="8.4" height="6" rx="1.3"
                    stroke="rgba(255,255,255,0.28)" strokeWidth="1.1" />
                  <path d="M2.5 4.5V3a2.5 2.5 0 1 1 5 0v1.5"
                    stroke="rgba(255,255,255,0.28)" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
                Secured by Stripe · Cancel anytime
              </p>
            )}
          </div>

        </motion.div>
      </motion.div>

      <style>{`
        @keyframes cm-spin { to { transform: rotate(360deg); } }
        input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>
    </AnimatePresence>
  );
};

export default CheckoutModal;
