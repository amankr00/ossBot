import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // ✅ allows access from other devices / networks
    allowedHosts: ['.ngrok-free.dev'], // ✅ allows ngrok public URLs
  },
})
