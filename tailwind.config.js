/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        venox: {
          50: '#eff8ff',
          100: '#dff0ff',
          200: '#b8e3ff',
          300: '#78cbff',
          400: '#32b0fe',
          500: '#0798f2',
          600: '#0078d4',
          700: '#0560aa',
          800: '#0a528c',
          900: '#0f4674',
        },
        obsidian: '#08111f',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
