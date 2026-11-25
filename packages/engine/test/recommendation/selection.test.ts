// `rank` with the Candidates prepared once (`avaliar`'s rounds): the
// shortcut that skips the guesses that cannot reach the top gives the same
// list as the full order.

import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import {
  Environment,
  prepareSelection,
  rank,
  Sqlite,
  type RankOptions,
} from '../../src/index.ts'
import { useFixture } from '../fixture.ts'

const both = (options: RankOptions) =>
  Effect.gen(function* () {
    const { weights } = yield* Environment
    return yield* (yield* Sqlite).read((db) =>
      Effect.gen(function* () {
        const selection = yield* prepareSelection(db, weights)
        return {
          prepared: yield* rank(db, { ...options, selection }),
          full: yield* rank(db, options),
        }
      }),
    )
  })

test.each([
  { attendees: ['bruno'], count: 5 },
  { attendees: ['teo'], count: 8 },
  { attendees: ['bruno', 'iara'], count: 100, moods: ['leve'] },
])('the same films for $attendees, $count', async (options) => {
  const { prepared, full } = await useFixture().ok(both(options))

  expect(prepared.films).toEqual(full.films)
  expect(prepared.films.length).toBe(Math.min(options.count, full.films.length))
})
