import type { Config } from 'tailwindcss'

// Design tokens. Every color in the app comes from this palette — pages
// should never reach for raw hex values. The values themselves live as CSS
// variables in app/globals.css so they can be tuned in one place.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        subtle: token('subtle'),
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        ink: {
          DEFAULT: token('ink'),
          soft: token('ink-soft'),
        },
        muted: token('muted'),
        faint: token('faint'),
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          soft: token('accent-soft'),
        },
        yes: {
          DEFAULT: token('yes'),
          soft: token('yes-soft'),
        },
        no: {
          DEFAULT: token('no'),
          soft: token('no-soft'),
        },
        warn: {
          DEFAULT: token('warn'),
          soft: token('warn-soft'),
        },
        sun: token('sun'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        page: '1160px',
      },
      boxShadow: {
        pop: '0 1px 2px rgb(27 24 56 / 0.05), 0 12px 32px -8px rgb(27 24 56 / 0.18)',
        lift: '0 1px 2px rgb(27 24 56 / 0.04), 0 10px 30px -12px rgb(109 74 255 / 0.28)',
        glow: '0 8px 24px -8px rgb(109 74 255 / 0.55)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'grow-x': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
        'grow-y': {
          '0%': { transform: 'scaleY(0)' },
          '100%': { transform: 'scaleY(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '100% 0' },
          '100%': { backgroundPosition: '-100% 0' },
        },
        'live-ring': {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '100%': { transform: 'scale(2.6)', opacity: '0' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(24px, -18px) scale(1.06)' },
        },
        'drift-alt': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-20px, 16px) scale(0.96)' },
        },
        pop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)' },
        },
        'status-flash': {
          '0%': { boxShadow: '0 0 0 0 rgb(184 110 0 / 0)' },
          '25%': { boxShadow: '0 0 0 6px rgb(184 110 0 / 0.35)' },
          '100%': { boxShadow: '0 0 0 14px rgb(184 110 0 / 0)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-up': 'fade-up 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'scale-in': 'scale-in 0.28s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'grow-x': 'grow-x 1s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'grow-y': 'grow-y 1.2s cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'live-ring': 'live-ring 1.6s cubic-bezier(0, 0, 0.2, 1) infinite',
        drift: 'drift 14s ease-in-out infinite',
        'drift-alt': 'drift-alt 17s ease-in-out infinite',
        pop: 'pop 0.4s cubic-bezier(0.2, 0.7, 0.2, 1)',
        marquee: 'marquee 40s linear infinite',
        'status-flash': 'status-flash 1.4s ease-out 2',
      },
    },
  },
  plugins: [],
}
export default config
