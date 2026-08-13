import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  // Monorepo: load VITE_* from repo root `.env` (not apps/pwa/)
  envDir: path.resolve(__dirname, '../..'),
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'OpnameApp',
        short_name: 'OpnameApp',
        description: 'Vastgoed opname platform',
        theme_color: '#7B1E3C',
        background_color: '#F7F7F8',
        display: 'standalone',
        start_url: '/',
        lang: 'nl',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Include font files so the shell works fully offline after first visit.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
      // Dev SW cannot cache Vite's unbundled modules; offline shell needs build/preview.
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  test: {
    name: 'pwa',
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
