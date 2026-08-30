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
        accent: "#00e6e6",
        teal: {
          DEFAULT: "#64c9d7",
          mid: "#22a6b3",
        },
        navy: {
          DEFAULT: "#000814",
          deep: "#020813",
          surface: "#07121d",
          raised: "#0b1722",
          panel: "#101c28",
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "Poppins", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 28px rgba(0, 230, 230, 0.16)",
        dock: "0 -16px 48px rgba(0, 0, 0, 0.4)",
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
};
