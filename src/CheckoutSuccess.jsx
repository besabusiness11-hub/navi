import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const CheckoutSuccess = () => {
  const [dots, setDots] = useState('');
  useEffect(() => {
    const id = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center font-sans px-6"
      style={{ background: '#06060a' }}>
      <div className="text-center max-w-md">
        {/* Animated vinyl */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 rounded-full"
              style={{ background: 'radial-gradient(ellipse at center, rgba(61,196,90,0.25) 0%, transparent 70%)', filter: 'blur(20px)', transform: 'scale(1.4)' }} />
            <motion.img
              src="/vinile-finale.png"
              alt="Navi"
              className="w-20 h-20 rounded-full object-cover relative z-10"
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center z-20"
              style={{ background: '#3dc45a', border: '2px solid #06060a' }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 500 }}>
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <p className="text-[10px] font-mono tracking-[0.25em] uppercase text-white/30 mb-3">Payment confirmed</p>
          <h1 className="text-2xl font-semibold text-white mb-3">Welcome to Navi.</h1>
          <p className="text-[13px] text-white/45 leading-relaxed mb-8">
            Your account is being set up. Check your inbox — you'll receive a welcome email with your embed code,
            dashboard link, and API key.
          </p>

          <div className="rounded-2xl p-5 mb-6 text-left space-y-3"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              { n: '1', text: 'Open your welcome email' },
              { n: '2', text: 'Copy the one-line script tag' },
              { n: '3', text: 'Paste before </body> on your site' },
              { n: '4', text: 'Open your dashboard → Navi is live' },
            ].map(s => (
              <div key={s.n} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-mono"
                  style={{ background: 'rgba(61,196,90,0.15)', color: '#3dc45a', border: '1px solid rgba(61,196,90,0.3)' }}>
                  {s.n}
                </div>
                <p className="text-[12px] text-white/50">{s.text}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 justify-center mb-6">
            <motion.div className="w-1.5 h-1.5 rounded-full bg-white/20"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }} />
            <motion.div className="w-1.5 h-1.5 rounded-full bg-white/20"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }} />
            <motion.div className="w-1.5 h-1.5 rounded-full bg-white/20"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }} />
            <span className="text-[10px] font-mono text-white/20 ml-1">Sending email{dots}</span>
          </div>

          <div className="flex flex-col gap-2">
            <a href="/"
              className="text-[11px] font-mono text-white/20 hover:text-white/45 transition-colors">
              ← Back to site
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default CheckoutSuccess;
