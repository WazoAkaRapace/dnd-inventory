/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // D&D parchment + fantasy palette
        parchment: {
          50: '#fdfaf3',
          100: '#f7f0e1',
          200: '#ece0c4',
          300: '#ddcb9e',
          400: '#c9b074',
          500: '#b8975a',
        },
        blood: {
          500: '#8b1a1a',
          600: '#7a1f1f',
          700: '#651515',
        },
        ink: {
          900: '#2a1f14',
          700: '#4a3825',
          500: '#6b5640',
          400: '#8a7558',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Georgia', 'serif'],
        body: ['Iowan Old Style', 'Palatino', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
