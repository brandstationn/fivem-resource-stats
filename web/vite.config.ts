import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The site is served from a sub-path on GitHub Pages, so every URL is relative.
// In dev, api/* is proxied to the live site so the UI shows real data.
export default defineConfig({
  base: "./",
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "./src") } },
  server: {
    proxy: {
      "/api": {
        target: "https://brandstationn.github.io",
        changeOrigin: true,
        rewrite: (p) => "/fivem-resource-stats" + p,
      },
    },
  },
})
