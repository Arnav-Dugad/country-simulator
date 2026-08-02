/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          950: '#04060d',
          900: '#070b16',
          850: '#0a0f1f',
          800: '#0e1528',
          750: '#131c33',
          700: '#1a2440',
          600: '#26324f',
          500: '#3a4767',
        },
        gold: {
          400: '#f5d073',
          500: '#e5b447',
          600: '#c9942c',
        },
        aurora: {
          cyan: '#3ddbd9',
          blue: '#4f8cff',
          violet: '#9d6bff',
          pink: '#ff6bb5',
          amber: '#ffb648',
          lime: '#7ee787',
          red: '#ff5c6c',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255,255,255,0.06), 0 20px 60px -20px rgba(79,140,255,0.45)',
        'glow-gold': '0 0 0 1px rgba(229,180,71,0.25), 0 22px 60px -22px rgba(229,180,71,0.55)',
        panel: '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 24px 70px -30px rgba(0,0,0,0.9)',
      },
      backgroundImage: {
        'mesh-1':
          'radial-gradient(at 8% 12%, rgba(79,140,255,0.30) 0px, transparent 55%), radial-gradient(at 88% 8%, rgba(157,107,255,0.26) 0px, transparent 50%), radial-gradient(at 74% 88%, rgba(61,219,217,0.18) 0px, transparent 55%), radial-gradient(at 22% 92%, rgba(255,107,181,0.16) 0px, transparent 50%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.5)', opacity: '0' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        'gradient-pan': {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        shimmer: 'shimmer 2.4s linear infinite',
        float: 'float 7s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow': 'spin-slow 26s linear infinite',
        'gradient-pan': 'gradient-pan 9s ease infinite',
      },
    },
  },
  plugins: [],
};
