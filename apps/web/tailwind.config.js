/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7f2",
          100: "#d6ebdd",
          200: "#aed7bf",
          300: "#84c3a1",
          400: "#5caf84",
          500: "#3f8e67",
          600: "#326f52",
          700: "#26523d",
          800: "#1a372a",
          900: "#0f2119"
        }
      }
    }
  },
  plugins: []
};
