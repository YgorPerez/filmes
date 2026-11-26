import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  // Each story lives next to its piece, in `src/ui/` (ADR 0008).
  stories: ['../src/**/*.stories.tsx'],
  framework: {
    name: '@storybook/react-vite',
    // The app's `vite.config.ts` builds TanStack Start and nitro, and
    // neither knows how to serve a story. Storybook reads its own.
    options: { builder: { viteConfigPath: '.storybook/vite.config.ts' } },
  },
}

export default config
