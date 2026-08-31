/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#F3F5F8",
        surface: "#FFFFFF",
        forest: "#0B1220",
        primary: "#0E7C86",
        "primary-container": "#075257",
        secondary: "#1B2536",
        "text-primary": "#101828",
        "text-secondary": "#5B6472",
        outline: "#E2E6ED",
        error: "#C0152F",
        warning: "#B7791F",
        success: "#12805C",
        "brand-soft": "#E4F3F3",
        "positive-soft": "#E7F6EF",
        "warning-soft": "#FBF1DD",
        "negative-soft": "#FCE9EA"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["Manrope", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"]
      },
      borderRadius: {
        analytics: "10px"
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.06)",
        analytics: "0 4px 16px rgba(16,24,40,0.08)"
      }
    }
  },
  plugins: []
};
