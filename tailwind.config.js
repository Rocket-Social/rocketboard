/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-strong': 'var(--color-primary-strong)',
        'primary-soft': 'var(--color-primary-soft)',
        canvas: 'var(--color-canvas)',
        'canvas-accent': 'var(--color-canvas-accent)',
        surface: {
          base: 'var(--color-surface-base)',
          elevated: 'var(--color-surface-elevated)',
          muted: 'var(--color-surface-muted)',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar-bg)',
          soft: 'var(--color-sidebar-soft)',
        },
        text: {
          strong: 'var(--color-text-strong)',
          medium: 'var(--color-text-medium)',
          muted: 'var(--color-text-muted)',
          inverse: 'var(--color-text-inverse)',
          'inverse-muted': 'var(--color-text-inverse-muted)',
        },
        border: {
          subtle: 'var(--color-border-subtle)',
          strong: 'var(--color-border-strong)',
        },
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
      },
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        lg: '10px',
        xl: '16px',
        '2xl': '24px',
      },
      boxShadow: {
        panel: '0 10px 24px rgba(23, 32, 43, 0.08)',
        elevated: '0 18px 40px rgba(23, 32, 43, 0.12)',
        float: '0 24px 60px rgba(15, 23, 42, 0.16)',
      },
      keyframes: {
        'toast-enter': {
          '0%': {opacity: '0', transform: 'translate(-50%, 12px)'},
          '100%': {opacity: '1', transform: 'translate(-50%, 0)'},
        },
        'toast-exit': {
          '0%': {opacity: '1', transform: 'translate(-50%, 0)'},
          '100%': {opacity: '0', transform: 'translate(-50%, 12px)'},
        },
        // AI Kanban Phase 4 PR 4-A — agent-comment streaming indicator.
        // Three vertical bars share this keyframe with staggered
        // animation-delay so the wave reads as a live signal next to
        // the persona byline (D16). 4px ↔ 8px height range.
        'audio-wave': {
          '0%, 100%': {transform: 'scaleY(0.5)'},
          '50%': {transform: 'scaleY(1)'},
        },
      },
      animation: {
        'toast-enter': 'toast-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'toast-exit': 'toast-exit 180ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards',
        'audio-wave': 'audio-wave 600ms ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
