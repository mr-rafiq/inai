/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Calm, slightly-dark palette with a single luminous accent (the orb).
        ink: {
          950: "#0a0b12",
          900: "#0f1119",
          800: "#171a26",
          700: "#222636",
        },
        accent: {
          DEFAULT: "#7c9cff",
          soft: "#a9bcff",
          glow: "#5b7cff",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        orb: "0 0 80px 12px rgba(91,124,255,0.45)",
      },
    },
  },
  plugins: [],
};
