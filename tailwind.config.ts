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
        // Light, neutral workspace: the application background is a soft grey so
        // white cards read as slightly elevated surfaces.
        background: {
          DEFAULT: '#F4F5F7',
          secondary: '#FFFFFF',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#F7F8FA',
          border: '#E3E6EB',
        },
        // Deep indigo primary with a darker companion tone for emphasis.
        accent: {
          DEFAULT: '#4F46E5',
          violet: '#4338CA',
          cyan: '#0E7490',
        },
        // Dark charcoal text at three strengths for a clear hierarchy.
        content: {
          DEFAULT: '#1F2430',
          secondary: '#3F4753',
          muted: '#5F6773',
        },
        // One step darker than the classic 600 shades: badges and inline
        // messages render these on a 10% tint of the same hue, which would drop
        // the contrast of the lighter shades below 4.5:1.
        success: '#065F46',
        warning: '#92400E',
        danger: '#B91C1C',
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
        // A restrained single-hue indigo gradient: strong hierarchy without the
        // neon two-tone look of the previous theme.
        'accent-gradient': 'linear-gradient(135deg, #4F46E5, #4338CA)',
        'accent-decorative':
          'linear-gradient(135deg, rgba(79,70,229,0.08), rgba(67,56,202,0.04))',
      },
      boxShadow: {
        // Very soft elevation: cards are separated by borders, not by heavy depth.
        card: '0 1px 2px rgba(16, 24, 40, 0.06)',
        raised: '0 8px 24px -14px rgba(16, 24, 40, 0.22)',
        glow: '0 10px 28px -18px rgba(79, 70, 229, 0.45)',
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
