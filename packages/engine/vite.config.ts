import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Builds the fixture database through Python, once (see the file).
    globalSetup: ['test/global-setup.ts'],
    // The fixture is built from these, outside the import graph: with
    // `--changed` (the push hook), a change to one of them reruns every test.
    forceRerunTriggers: [
      '**/package.json/**',
      '**/vite.config.*/**',
      '**/tests/fixture/**',
      '**/filmes/**/*.{py,sql}',
      '**/config/*.{toml,json}',
      '**/key-migration/src/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      include: ['src/**'],
      // The floor is the coverage from when it came in: it goes up with
      // coverage, never down.
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
    },
  },
})
