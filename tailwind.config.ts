import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ink/neutral are CSS-variable-backed (see globals.css) so a
        // single data-theme switch re-colors every existing bg-ink-*,
        // border-ink-*, and text-neutral-* class across the app without
        // touching each component — see the "Theming" note in
        // globals.css for the one exception (text-onaccent).
        ink: {
          950: "rgb(var(--ink-950) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
        },
        neutral: {
          50: "rgb(var(--neutral-50) / <alpha-value>)",
          100: "rgb(var(--neutral-100) / <alpha-value>)",
          200: "rgb(var(--neutral-200) / <alpha-value>)",
          300: "rgb(var(--neutral-300) / <alpha-value>)",
          400: "rgb(var(--neutral-400) / <alpha-value>)",
          500: "rgb(var(--neutral-500) / <alpha-value>)",
          600: "rgb(var(--neutral-600) / <alpha-value>)",
          700: "rgb(var(--neutral-700) / <alpha-value>)",
        },
        // Always near-black, in both themes — reserved for text sitting
        // on top of a fixed-brightness accent button (bg-saffron-500),
        // which never darkens/lightens with the theme, so its text
        // shouldn't flip either. Not themed on purpose.
        onaccent: "#0a0b0f",
        saffron: {
          // 400 is themed (badge/status text needs a darker, more
          // saturated amber on a light background than on a dark one);
          // 500/600 are fixed solid-button/icon colors, vivid enough
          // for both themes as-is.
          400: "rgb(var(--saffron-400) / <alpha-value>)",
          500: "#ff9f1c",
          600: "#e8870a",
        },
        matrix: {
          400: "rgb(var(--matrix-400) / <alpha-value>)",
          500: "#2dd4bf",
          600: "#0d9488",
        },
        red: {
          // Only the 400 "error text" shade is themed, for the same
          // reason as saffron/matrix-400 above; other red shades
          // (used for borders/background tints) keep Tailwind's
          // defaults, which read fine as-is in both themes.
          400: "rgb(var(--red-400) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2s linear infinite",
        "fade-in-up": "fadeInUp 0.35s ease-out",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
