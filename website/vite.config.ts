import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser only talks to this dev server, which forwards to the backend
    // (no CORS setup needed on the Vouch server or the agent runner).
    proxy: {
      "/vouch": { target: process.env.VOUCH_URL ?? "http://localhost:4000", changeOrigin: true, rewrite: (p) => p.replace(/^\/vouch/, "") },
      "/runner": { target: process.env.RUNNER_URL ?? "http://localhost:4100", changeOrigin: true, rewrite: (p) => p.replace(/^\/runner/, "") },
    },
  },
});
