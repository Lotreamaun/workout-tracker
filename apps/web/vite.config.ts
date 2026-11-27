import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pushWorkerRevision = createHash('sha256')
  .update(readFileSync(new URL('./public/rest-push-sw.js', import.meta.url)))
  .digest('hex').slice(0, 12);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.svg'],
      manifest: {
        name: 'Workout Tracker',
        short_name: 'Тренировки',
        description: 'Персональный трекер тренировок',
        lang: 'ru',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Обработчики push/notificationclick лежат отдельным файлом из public/:
        // generateSW сохраняет регистрацию, precache и кэширование, importScripts
        // лишь подключает файл к сгенерированному воркеру.
        importScripts: [`rest-push-sw.js?v=${pushWorkerRevision}`],
        // Файл обработчиков раздаётся напрямую и не участвует в precache.
        globIgnores: ['**/rest-push-sw.js'],
        navigateFallbackDenylist: [/^\/api\//, /^\/media\//],
        // Данные тренировок не кэшируются: любые запросы к /api идут только в сеть.
        runtimeCaching: [{ urlPattern: /\/api\//, handler: 'NetworkOnly' }],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  // .env лежит в корне репозитория (общий с api).
  envDir: path.resolve(import.meta.dirname, '../..'),
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
  preview: { host: '0.0.0.0', port: 4173 },
});
