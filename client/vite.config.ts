import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          dnd: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          motion: ['framer-motion'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.trycloudflare.com', // 👈 pozwól na wszystkie subdomeny trycloudflare.com
    ],
  },
})
