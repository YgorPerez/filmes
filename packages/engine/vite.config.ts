import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    // No engine code is ported yet (#73). The first ported module brings its
    // test and the coverage floor, and this line goes away.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      include: ['src/**'],
    },
  },
})
