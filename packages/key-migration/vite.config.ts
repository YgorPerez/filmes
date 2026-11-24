import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
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
