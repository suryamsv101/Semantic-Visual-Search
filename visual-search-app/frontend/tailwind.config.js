/** @type {import('tailwindcss').Config} */
export default {
  // Tell Tailwind where to look for class usage
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Custom colour palette for the Visual Search brand
      colors: {
        surface: {
          DEFAULT: "#0d0f14",
          raised:  "#13161e",
          high:    "#1a1e2a",
        },
        accent: {
          DEFAULT: "#6366f1",   // indigo
          light:   "#818cf8",
          glow:    "#4f46e5",
        },
        success: "#22c55e",
        warn:    "#f59e0b",
        danger:  "#ef4444",
      },

      // Custom animations
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(99,102,241,0)" },
          "50%":       { boxShadow: "0 0 20px 4px rgba(99,102,241,0.4)" },
        },
      },
      animation: {
        shimmer:    "shimmer 1.4s linear infinite",
        fadeUp:     "fadeUp 0.4s ease-out forwards",
        pulseGlow:  "pulseGlow 2s ease-in-out infinite",
      },

      // Monospaced font for scores / labels
      fontFamily: {
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
