// Expected output committed next to the test: a Vitest snapshot. The
// snapshots that hold a whole engine output were recorded from the Python
// engine before it left the repository (ticket #108), while the parity
// tests that compared the two engines still passed, so they hold what the
// Python answered.

import { expect } from 'vite-plus/test'
import type { Fixture } from './fixture.ts'

/** `value` against the test's next snapshot, with the test's own folder
 * written as `<root>`. */
export const expectRecorded = (fixture: Fixture, value: unknown): void => {
  expect(
    JSON.parse(JSON.stringify(value).replaceAll(fixture.root, '<root>')),
  ).toMatchSnapshot()
}
