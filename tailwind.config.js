/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#06162d',
          900: '#082044',
          800: '#0b2b5f',
          700: '#0f3d7d',
        },
        brand: {
          blue: '#0b66ff',
          teal: '#16c7bd',
          sky: '#dff1ff',
        },
      },
      boxShadow: {
        soft: '0 18px 50px rgba(15, 35, 65, 0.12)',
        panel: '0 24px 70px rgba(4, 18, 38, 0.22)',
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
