/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      xs: "475px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    extend: {
      colors: {
        accent: "#3b82f6",
        muted: "#a3b4cc",
        surface: "#0b1629",
        teal: {
          DEFAULT: "#93c5fd",
          mid: "#2563eb",
        },
        navy: {
          DEFAULT: "#060d1b",
          deep: "#030814",
          surface: "#0b1629",
          raised: "#101f36",
          panel: "#162943",
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "Poppins", "system-ui", "sans-serif"],
        display: ["var(--font-righteous)", "var(--font-poppins)", "Poppins", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 28px rgba(59,130,246, 0.16)",
        dock: "0 -16px 48px rgba(0, 0, 0, 0.4)",
      },
      borderRadius: {
        card: "14px",
      },
      // Tailwind <3.4 has no numeric min-h/min-w scale; wire it to spacing so
      // min-h-11 / min-w-11 (used for 44px touch targets) actually emit CSS.
      minHeight: ({ theme }) => ({ ...theme("spacing") }),
      minWidth: ({ theme }) => ({ ...theme("spacing") }),
    },
  },
  plugins: [],
};
