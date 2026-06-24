import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark control-plane surfaces (graphite).
        ink: {
          950: "#0B0D10",
          900: "#0E1116",
          850: "#14171C",
          800: "#1B1F26",
          700: "#262B33",
          600: "#353B45",
          500: "#4A515E",
          400: "#7F8593",
          300: "#9BA1AD",
          200: "#B9BDC7",
          100: "#C9CDD6",
          50: "#F4F1EA",
        },
        gold: {
          300: "#FFD27A",
          400: "#FFC95C",
          500: "#F5B544",
          600: "#B8801F",
          700: "#8A5F16",
        },
        teal: {
          300: "#6EEAD9",
          400: "#2FE0C6",
          500: "#1FB8A3",
        },
        // Repoint legacy "brand" usages onto the gold ramp so any unstyled
        // component reads on-palette instead of blinding blue.
        brand: {
          50: "#1C1810",
          100: "#2A2415",
          200: "#4A3D1C",
          300: "#8A6A20",
          400: "#FFC95C",
          500: "#F5B544",
          600: "#E0A638",
          700: "#FFD27A",
          800: "#B8801F",
          900: "#8A5F16",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Space Grotesk", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,.03) inset, 0 10px 30px rgba(0,0,0,.45)",
        glow: "0 0 0 3px rgba(245,181,68,.16)",
      },
    },
  },
  plugins: [],
};

export default config;
