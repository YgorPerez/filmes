// Playwright's `test` on the app server of the test's file (`servers.ts`).
// Every e2e file takes `test` and `expect` from here, directly or through
// `support.ts`.

import { test as base, expect } from '@playwright/test'
import { serverOf } from './servers'

/** Playwright's `test`, with `baseURL` on the app server of the test's file,
 * unless the config sets one. */
export const test = base.extend({
  baseURL: async ({ baseURL }, provide, info) => {
    await provide(baseURL ?? serverOf(info.file).origin)
  },
})

export { expect }
