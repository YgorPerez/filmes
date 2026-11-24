import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Each test calls the real Python CLI, and each file's `beforeAll`
    // rebuilds the fixture database with it (`test/ambiente.ts`).
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
