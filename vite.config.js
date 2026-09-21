import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/firebase/') || id.includes('\\firebase\\') || id.includes('@firebase')) return 'firebase'
          if (id.includes('/recharts/') || id.includes('\\recharts\\')) return 'recharts'
          if (id.includes('@radix-ui')) return 'radix'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('react-router')) return 'react-vendor'
          return undefined
        },
      },
    },
  },
})
