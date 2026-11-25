import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Several tests check every code point or spawn Python for golden
    // vectors. They take ~1-2 s alone but pass 5 s when other sessions load
    // this machine (load average 20-50), so the limit is generous.
    testTimeout: 30_000,
    // Builds the fixture database through Python, once (see the file).
    globalSetup: ['test/global-setup.ts'],
    // The fixture is built from these, outside the import graph: with
    // `--changed` (the push hook), a change to one of them reruns every test.
    forceRerunTriggers: [
      '**/package.json/**',
      '**/vite.config.*/**',
      '**/tests/fixture/**',
      // The trace hook the oracle's harvest test runs.
      '**/tests/conftest.py',
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
