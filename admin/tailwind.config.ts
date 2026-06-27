import type { Config } from "tailwindcss";

/**
 * Scoped to the marketing landing only. Preflight (Tailwind's global CSS reset)
 * is DISABLED so it never touches the hand-rolled dashboard styles in
 * app/globals.css. Utilities are namespaced visually under the `.cp` wrapper.
 */
const config: Config = {
  content: [
    "./app/page.tsx",
    "./app/landing/**/*.{ts,tsx}",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#06070D",
        ink2: "#0B0D17",
        haze: "#9AA3B2",
        line: "rgba(255,255,255,0.08)",
        indigo2: "#6366F1",
        violet2: "#A855F7",
        cyan2: "#22D3EE",
        mint: "#34D399",
      },
      maxWidth: {
        shell: "1200px",
      },
    },
  },
  plugins: [],
};

export default config;
