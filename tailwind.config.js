/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'void': '#020405',
        'void-light': '#041015',
        'venetian-gold': '#D4AF37',
        'gold-light': '#F5E6B8',
        'pure-light': '#F5F5F5',
      },
      fontFamily: {
        'serif': ['"Playfair Display"', 'Georgia', 'serif'],
        'mono': ['"JetBrains Mono"', 'Consolas', 'monospace'],
        'sans': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      letterSpacing: {
        'luxury': '0.5em',
        'wide-luxury': '0.3em',
        'ultra-wide': '0.6em',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ripple': 'ripple 2s ease-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'venetian-gradient': 'linear-gradient(180deg, #020405 0%, #041015 50%, #020405 100%)',
      },
      boxShadow: {
        'gold': '0 0 20px rgba(212, 175, 55, 0.1), 0 0 40px rgba(212, 175, 55, 0.05)',
        'gold-lg': '0 0 30px rgba(212, 175, 55, 0.15), 0 0 60px rgba(212, 175, 55, 0.08)',
        'inner-gold': 'inset 0 0 20px rgba(212, 175, 55, 0.05)',
      },
      blur: {
        'xs': '2px',
      },
      transitionDuration: {
        '2000': '2000ms',
        '3000': '3000ms',
      },
      transitionTimingFunction: {
        'luxury': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        'liquid': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
