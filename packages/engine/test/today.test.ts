import { Effect } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, test } from 'vite-plus/test'
import { requestToday, Run, Today } from '../src/index.ts'
import { FIXTURE_TODAY, useFixture } from './fixture.ts'

/** Today's date at the instant `iso`, by a test clock. */
const todayAt = (iso: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(iso))
    const today = yield* Today
    return yield* today.date
  }).pipe(Effect.provide(TestClock.layer()))

describe('today', () => {
  test('FILMES_HOJE pins it', async () => {
    const fixture = useFixture()

    const today = await fixture.ok(
      Effect.gen(function* () {
        const run = yield* Run
        return run.today
      }),
    )

    expect(today).toBe(FIXTURE_TODAY)
  })

  test('requestToday gives the screens the same date', async () => {
    expect(await useFixture().ok(requestToday)).toBe(FIXTURE_TODAY)
  })

  test('otherwise it is the date in São Paulo, not in UTC', async () => {
    const fixture = useFixture()
    const unpinned = { FILMES_HOJE: undefined }

    const lateEvening = await fixture.ok(
      todayAt('2026-11-21T02:59:59Z'),
      unpinned,
    )
    const midnight = await fixture.ok(todayAt('2026-11-21T03:00:00Z'), unpinned)

    expect(lateEvening).toBe('2026-11-20')
    expect(midnight).toBe('2026-11-21')
  })

  test.each(['2026-02-30', '20261120', '2026-11-20T10:00', 'hoje'])(
    'FILMES_HOJE=%s is invalid_config',
    async (value) => {
      const fixture = useFixture()

      const outcome = await fixture.run(Effect.void, { FILMES_HOJE: value })

      expect(outcome).toEqual({
        exitCode: 1,
        output: {
          error: {
            code: 'invalid_config',
            message: `FILMES_HOJE inválido: '${value}'`,
          },
        },
      })
    },
  )
})
