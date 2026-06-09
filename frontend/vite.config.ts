import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('react-dom') || id.includes('react')) return 'react'
          if (id.includes('earcut')) return 'pixi-graphics'
          if (id.includes('pixi.js') || id.includes('@pixi')) {
            if (id.includes('/assets/') || id.includes('/assets\\')) return 'pixi-assets'
            if (id.includes('/events/') || id.includes('/events\\') || id.includes('/accessibility/')) return 'pixi-events'
            if (id.includes('/scene/') || id.includes('/scene\\')) return 'pixi-scene'
            if (id.includes('/rendering/') || id.includes('/rendering\\') || id.includes('/environment/')) return 'pixi-renderer'
            return 'pixi-core'
          }
          return 'vendor'
        },
      },
    },
  },
})
