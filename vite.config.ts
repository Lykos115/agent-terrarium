import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vite dev server config.
 *
 * The Bun server (src/server/index.ts) proxies HTTP to Vite on port 5173 in
 * dev mode, but it cannot proxy WebSocket upgrades through Bun's fetch-based
 * proxy. So we pin Vite's HMR client to connect directly to 5173 — the
 * browser loads the page via 3000, but HMR talks to 5173.
 *
 * Without this, HMR silently fails and Vite's client falls into a reconnect
 * loop that causes the page to flash/reload repeatedly.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: "localhost",
    hmr: {
      host: "localhost",
      port: 5173,
      clientPort: 5173,
      protocol: "ws",
    },
  },
});
