/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: {
            DEFAULT: '#006939', // Granite Green
            dark: '#004D2A',    // Dark Green
            medium: '#007A42',  // Medium Green
            light: '#E8F5EE',   // Light Green
          },
          yellow: {
            DEFAULT: '#FDB913', // Granite Yellow
            deep: '#E0A200',    // Deep Yellow
            light: '#FFF8E7',   // Light Yellow
          },
          gray: {
            DEFAULT: '#A9AEB1', // Concrete Gray
            light: '#F3F4F6',   // Light Gray
            mid: '#6B7280',     // Mid Gray
          },
          text: {
            dark: '#1A1A1A',    // Near black
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'Neo Sans Pro', 'sans-serif'],
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-up': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.3s ease-out',
        'scale-up': 'scale-up 0.2s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
      },
    },
  },
  plugins: [],
}


