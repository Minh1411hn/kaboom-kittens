import { fileURLToPath } from 'node:url'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

/**
 * Two projects:
 *   - `node`   pure engine + WebSocket integration tests, no browser
 *   - `nuxt`   component tests, which need Nuxt's auto-imports and a DOM
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
        },
        resolve: {
          alias: {
            '~~': fileURLToPath(new URL('.', import.meta.url)),
            '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
          },
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          environment: 'nuxt',
          include: ['app/**/*.test.ts'],
        },
      }),
    ],
  },
})
