import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const API_PORT = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT ?? 5190),
    strictPort: true,
    watch: { ignored: (p: string) => /[\\/](\.data|\.data-test|\.cache|test-results|playwright-report|dist)([\\/]|$)/.test(p) },
    proxy: { "/api": { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
