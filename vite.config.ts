import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',          // ← critical for Capacitor: assets load from file:// not /
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Keep chunk names predictable for Capacitor
        manualChunks: undefined,
      },
    },
  },
})