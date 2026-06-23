import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        surface: "rgba(18, 18, 28, 0.85)",
        "surface-strong": "#12121c",
        foreground: "#f0eeff",
        muted: "#8b85a0",
        line: "rgba(139, 133, 160, 0.15)",
        accent: {
          DEFAULT: "#7c3aed",
          strong: "#6d28d9",
          soft: "rgba(124, 58, 237, 0.15)",
          glow: "rgba(124, 58, 237, 0.35)",
        },
        success: "#10b981",
        danger: "#ef4444",
        live: "#ff2d55",
      },
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(ellipse at top, rgba(124,58,237,0.18) 0%, transparent 60%), radial-gradient(ellipse at bottom right, rgba(236,72,153,0.1) 0%, transparent 50%), linear-gradient(180deg, #0a0a0f 0%, #0d0d18 100%)",
        "card-gradient":
          "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        "accent-gradient": "linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)",
        "live-gradient": "linear-gradient(135deg, #ff2d55 0%, #ff6b35 100%)",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 0 0 1px rgba(255,255,255,0.05)",
        "card-hover": "0 0 0 1px rgba(124,58,237,0.4), 0 8px 32px rgba(124,58,237,0.15)",
        "nav-blur": "0 1px 0 0 rgba(255,255,255,0.06)",
        glow: "0 0 24px rgba(124,58,237,0.4)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 8s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backdropBlur: {
        nav: "20px",
      },
    },
  },
  plugins: [],
};

export default config;
