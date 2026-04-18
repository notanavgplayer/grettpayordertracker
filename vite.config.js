import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Stable long-term cache hashes for vendor chunks
        manualChunks(id) {
          // Firebase into one chunk — lazy-loaded per feature but deduped
          if (id.includes('node_modules/firebase')) return 'firebase'
          // Recharts + deps into one chart chunk
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'recharts'
          // Radix UI primitives — commonly shared across all routes
          if (id.includes('node_modules/@radix-ui')) return 'radix'
          // React core — smallest stable chunk, max cache longevity
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) return 'react-vendor'
          // Everything else stays in the default vendor chunk
        },
      },
    },
  },
})
