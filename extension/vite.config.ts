import { crx } from "@crxjs/vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import manifest from "./manifest.config"

// DOCKER=1 is set by the extension image. Polling is what actually sees a
// save through a Docker Desktop bind mount. The browser is on the host, so
// the hot-reload socket has to be localhost:5173, the published port.
const docker = process.env.DOCKER === "1"

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5173,
    strictPort: true,
    host: docker ? true : "localhost",
    cors: {
      origin: [/chrome-extension:\/\//],
    },
    watch: docker ? { usePolling: true, interval: 300 } : undefined,
    hmr: docker ? { host: "localhost", clientPort: 5173 } : undefined,
  },
})
