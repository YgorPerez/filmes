import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig, type PluginOption } from 'vite-plus'

// Vitest only needs React: Start and nitro build the server, which no Vitest
// test uses.
const appPlugins = (): PluginOption[] => [
  // The Tailwind classes (`styles.css`, `ui/tokens.css`), before Start.
  tailwindcss(),
  tanstackStart(),
  nitro(),
  viteReact(),
  // The React Compiler memoizes every component and hook in the build.
  // React's plugin 6 no longer brings Babel, and the compiler is still a
  // Babel plugin: it runs through `@rolldown/plugin-babel`, only in the
  // browser bundle (the preset skips SSR).
  babel({ presets: [reactCompilerPreset()] }),
]

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: process.env.VITEST ? [viteReact()] : appPlugins(),
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
      'nginx/**/*.test.ts',
    ],
    environment: 'node',
    // The engine's fixture (English filmes-dados and config, the database
    // the Python engine builds), for the tests that run the real engine
    // (`useFixture`). Built once and cached, as in the engine's own tests.
    globalSetup: ['../packages/engine/test/global-setup.ts'],
    // The coverage serves `fallow health` (the `json` format) and has a
    // floor: the measured value, which rises with it and never falls.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
      exclude: ['src/routeTree.gen.ts'],
      // The routes and the router are covered by the build and its `/`
      // (CI's `build` job), not by Vitest; the deploy scripts' `ssh` and
      // `scp` and their command lines, by the deploy itself. The branch
      // floor came from a skeleton with no branches; #79's scripts set it
      // at their measured value.
      thresholds: { statements: 87, branches: 85, functions: 84, lines: 88 },
    },
  },
})
