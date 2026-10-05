import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom service worker so it can receive push notifications
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'PSC Helper',
        short_name: 'PSC Helper',
        description: 'Find Kerala PSC job openings that match your qualification',
        theme_color: '#1e3a8a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        lang: 'en-IN',
        // Generated from public/logo.svg by `npm run icons`
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,ico}'] },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:4000' },
  },
})
