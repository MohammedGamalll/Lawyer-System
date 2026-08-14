/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef3f8',
          100: '#d4e0ed',
          200: '#a9c1db',
          300: '#6e97c0',
          400: '#3d6d9e',
          500: '#1e4d7b',
          600: '#163a5f',
          700: '#122f4d',
          800: '#0f243c',
          900: '#0c1b2e',
          950: '#07111c'
        },
        gold: {
          50: '#fbf8ef',
          100: '#f5edd3',
          200: '#e9d8a0',
          300: '#dcc06a',
          400: '#c9a227',
          500: '#b0891c',
          600: '#8c6b16'
        }
      },
      fontFamily: {
        sans: ['Cairo', 'Segoe UI', 'Tahoma', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 3px rgba(12, 27, 46, 0.08), 0 8px 24px rgba(12, 27, 46, 0.06)'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
