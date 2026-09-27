module.exports = {
  mode: "jit",
  content: ["./src/**/**/*.{js,ts,jsx,tsx,html,mdx}", "./src/**/*.{js,ts,jsx,tsx,html,mdx}"],
  darkMode: "class",
  theme: {
    screens: {
      md: { max: "1050px" },
      sm: { max: "550px" },
      // The register's order panel sits beside the product grid from here up (tablet
      // landscape and wider). It's narrower than the old cart dock and the left nav is
      // already a drawer below 1050px, so this leaves room for at least a 3-column grid.
      posSplit: { min: "860px" },
    },
    extend: {
      colors: {
        white: { A700: "#ffffff" },
        gray: { 50: "#f6f7fb", 500: "#9f9f9f", 800: "#393d46", "500_87": "#9f9f9f87" },
        blue_gray: { 100: "#cdcfd1", "100_87": "#cdcfd187" },
        yellow: { 400: "#fae952" },
        primary: {
          50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2fe", 300: "#a5b4fc",
          400: "#818cf8", 500: "#6366f1", 600: "#4f46e5", 700: "#4338ca",
          800: "#3730a3", 900: "#312e81",
        },
        surface: { DEFAULT: "#ffffff", subtle: "#f8fafc", muted: "#f1f5f9", border: "#e2e8f0" },
        success: { 50: "#f0fdf4", 500: "#22c55e", 600: "#16a34a", 700: "#15803d" },
        danger: { 50: "#fef2f2", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c" },
      },
      borderRadius: { xl2: "1.25rem" },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
        cardHover: "0 4px 12px 0 rgb(0 0 0 / 0.08)",
        modal: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      },
      fontFamily: { poppins: "Poppins, 'Noto Nastaliq Urdu', sans-serif" },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    // `printing:` styles the Sales Report's printout. Report.jsx puts .is-printing on <html>
    // before it calls window.print() and keeps it until afterprint, so these hold for the
    // page it measures beforehand and for the paper alike — unlike md:/sm:, which would
    // switch on the paper's own (narrow) width.
    ({ addVariant }) => addVariant("printing", ".is-printing &"),
  ],
};
