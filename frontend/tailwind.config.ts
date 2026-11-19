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
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        page: '1160px',
      },
      boxShadow: {
        pop: '0 1px 2px rgb(20 20 19 / 0.04), 0 8px 24px -6px rgb(20 20 19 / 0.12)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
export default config
