import type { Config } from 'tailwindcss';

/**
 * Single source of truth for the Excel Data Analyzer design system.
 * Every colour, radius and shadow used by the UI is declared here so that
 * components never hardcode hex values.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#0B1020',
          secondary: '#111827',
        },
        surface: {
          DEFAULT: '#151D2E',
          elevated: '#1B2538',
          border: '#263247',
        },
        accent: {
          DEFAULT: '#6366F1',
          violet: '#8B5CF6',
          cyan: '#22D3EE',
        },
        content: {
          DEFAULT: '#F8FAFC',
          secondary: '#CBD5E1',
          muted: '#94A3B8',
        },
        success: '#22C55E',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      fontFamily: {
        sans: [
          'Inter Variable',
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      borderRadius: {
        control: '8px',
        field: '10px',
        card: '14px',
        panel: '18px',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #6366F1, #8B5CF6)',
        'accent-decorative':
          'linear-gradient(135deg, rgba(99,102,241,0.14), rgba(139,92,246,0.08))',
      },
      boxShadow: {
        card: '0 1px 2px rgba(2, 6, 23, 0.35)',
        raised: '0 10px 24px -18px rgba(2, 6, 23, 0.9)',
        glow: '0 12px 32px -18px rgba(99, 102, 241, 0.75)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(10px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'toast-out': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(8px) scale(0.99)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 380ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-in': 'toast-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-out': 'toast-out 220ms cubic-bezier(0.22, 1, 0.36, 1) both',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
