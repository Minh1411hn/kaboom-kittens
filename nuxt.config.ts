export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['@pinia/nuxt'],

  css: ['~/assets/css/main.css'],

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
