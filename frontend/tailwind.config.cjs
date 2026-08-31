/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#f9f9f7",
        surface: "#f9f9f7",
        "surface-white": "#ffffff",
        "surface-dim": "#dadad8",
        "surface-bright": "#f9f9f7",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f4f4f2",
        "surface-container": "#eeeeec",
        "surface-container-high": "#e8e8e6",
        "surface-container-highest": "#e2e3e1",
        "on-surface": "#1a1c1b",
        "on-surface-variant": "#3e4a3d",
        primary: "#006b2c",
        "primary-container": "#00873a",
        "on-primary": "#ffffff",
        "on-primary-container": "#f7fff2",
        "primary-fixed": "#7ffc97",
        "primary-fixed-dim": "#62df7d",
        "on-primary-fixed": "#002109",
        secondary: "#0054cb",
        "secondary-container": "#2d6deb",
        "tertiary-fixed": "#bdedda",
        "tertiary-fixed-dim": "#a2d0be",
        "deep-forest": "#0b3b2e",
        outline: "#6e7b6c",
        "outline-variant": "#bdcaba",
        "text-primary": "#111827",
        "text-secondary": "#6b7280",
        error: "#dc2626",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        warning: "#f59e0b",
        success: "#16a34a",
        lime: "#bef264",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["Sora", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
      },
      boxShadow: {
        card: "0 4px 20px rgba(0, 0, 0, 0.06)",
        "card-hover": "0 8px 28px rgba(0, 0, 0, 0.09)",
      },
      maxWidth: {
        app: "1280px",
      },
      keyframes: {
        "logo-in": {
          from: { opacity: "0", transform: "scale(0.88)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "page-enter": {
          from: { transform: "translateY(6px)" },
          to: { transform: "translateY(0)" },
        },
        "float-orb": {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(12px, -16px, 0) scale(1.05)" },
        },
      },
      animation: {
        "logo-in": "logo-in 600ms ease-out both",
        "page-enter": "page-enter 280ms ease-out both",
        "float-orb": "float-orb 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
