import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'

// Absolute, because Sass resolves @use against the filesystem and knows nothing
// about Nuxt's `~` alias.
const scssIndex = fileURLToPath(new URL('./app/assets/scss/_index.scss', import.meta.url))

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt', '@nuxt/icon'],

  icon: {
    serverBundle: {
      collections: ['lucide'],
    },
    clientBundle: {
      scan: true,
    },
  },

  // Order matters: main.css owns the base layer, tailwind.css ships unlayered
  // utilities that must come after it to win. See the header of tailwind.css.
  css: ['~/assets/css/main.css', '~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
    css: {
      preprocessorOptions: {
        scss: {
          // Tokens + mixins in every <style lang="scss"> without an import.
          additionalData: `@use '${scssIndex}' as *;\n`,
        },
      },
    },
  },

  typescript: {
    strict: true,
    typeCheck: false,
  },

  nitro: {
    experimental: {
      // Required for `defineWebSocketHandler` in server/routes/_ws.ts
      websocket: true,
    },
  },

  runtimeConfig: {
    redisUrl: 'redis://localhost:6379',
    nopeWindowMs: 5000,
    turnTimeoutMs: 45000,
    roomTtlSeconds: 21600,
    disconnectGraceMs: 60000,
    // Cloudflare Realtime SFU. Empty means voice chat is switched off — the
    // proxy routes answer 503 and the client hides the voice UI.
    realtimeAppId: '',
    realtimeAppSecret: '',
    public: {
      baseUrl: 'http://localhost:3000',
      maxPlayers: 10,
    },
  },

  app: {
    head: {
      title: 'Kaboom Kitten',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Online Exploding Kittens for up to 10 players.' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap',
        },
      ],
    },
  },
})
