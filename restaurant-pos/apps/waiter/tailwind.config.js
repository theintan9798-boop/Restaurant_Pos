/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Single source of truth for the accent — change here to re-skin the whole app
        brand: {
          DEFAULT: '#8b5cf6',
          50: '#f5f3ff',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
        },
      },
      boxShadow: {
        glow: '0 0 20px -2px rgba(139, 92, 246, 0.35)',
        'glow-lg': '0 0 40px -4px rgba(139, 92, 246, 0.45)',
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-6px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(6px)' },
        },
      },
      animation: {
        shake: 'shake 0.4s ease-in-out',
      },
    },
  },
  plugins: [],
};
