// The stories as tests, in a real Chrome: `pnpm test:stories`. It stays out
// of `vite.config.ts` because the story is built with Storybook's Vite
// (`.storybook/vite.config.ts`), and not with the app's (TanStack Start and
// nitro).
import { playwright } from 'vite-plus/test/browser-playwright'
import { defineConfig, mergeConfig } from 'vite-plus'
import storybookConfig from './.storybook/vite.config.ts'

export default mergeConfig(
  storybookConfig,
  defineConfig({
    test: {
      name: 'stories',
      include: ['src/platform/storybook/*.browser.test.tsx'],
      setupFiles: ['.storybook/vitest.setup.ts'],
      testTimeout: 30_000,
      // Vitest's server for Chrome, on 63315 unless `STORIES_PORT` picks
      // another: two checkouts running the stories at once need two.
      api: { port: Number(process.env.STORIES_PORT ?? 63315) },
      browser: {
        enabled: true,
        headless: true,
        // The installed Chrome, like the e2e (`playwright.config.ts`).
        provider: playwright({ launchOptions: { channel: 'chrome' } }),
        // Each story on phone and on desktop, like the e2e.
        instances: [
          {
            browser: 'chromium',
            name: 'mobile',
            viewport: { width: 412, height: 915 },
          },
          {
            browser: 'chromium',
            name: 'desktop',
            viewport: { width: 1280, height: 800 },
          },
        ],
      },
    },
  }),
)
