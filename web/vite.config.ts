import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const docker = process.env.DOCKER === "1"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: docker ? true : "localhost",
  },
})
