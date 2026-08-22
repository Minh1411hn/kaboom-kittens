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
          include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'tests/**/*.test.ts'],
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
          // Mounting the whole room page takes a few seconds under happy-dom;
          // the 5s default made those cases flaky.
          testTimeout: 15_000,
          environmentOptions: {
            nuxt: {
              // The app ships with `vi` as the default locale and browser
              // detection on top, which would make the rendered language depend
              // on happy-dom's navigator. Pin it so assertions on user-facing
              // copy are deterministic.
              overrides: {
                i18n: { defaultLocale: 'en', detectBrowserLanguage: false },
              },
            },
          },
        },
      }),
    ],
  },
})
