import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Every call runs the real engine on a copy of the fixture; the limit is
    // the engine's, for the same loaded machine.
    testTimeout: 30_000,
    // The engine's fixture (filmes-dados and config in English, the database
    // from its `rebuild`), built once and cached, as in the engine's tests.
    globalSetup: ['../engine/test/global-setup.ts'],
    // The fixture is built from these, outside the import graph.
    forceRerunTriggers: [
      '**/package.json/**',
      '**/vite.config.*/**',
      '**/tests/fixture/**',
      '**/engine/src/rebuild/schema/*.sql',
      '**/config/*.{toml,json}',
      '**/key-migration/src/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      include: ['src/**/*.ts'],
      // The floor is the coverage from when it came in: it goes up with
      // coverage, never down.
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
})
