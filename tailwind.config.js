/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050812",
        panel: "#08101f",
        gridline: "#233153",
        cyanLive: "#73ffd8",
      },
      boxShadow: {
        room: "0 0 0 1px rgba(111, 134, 255, 0.08), 0 22px 60px rgba(0,0,0,0.45)",
        glow: "0 0 24px rgba(115,255,216,0.22)",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
