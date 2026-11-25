// One engine serves many requests, as the server will: what a request
// records (warnings, a source switched off) must not reach the next one.

import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import { makeEngine, Run } from '../src/index.ts'
import { useFixture } from './fixture.ts'

const warnAndDisable = Effect.gen(function* () {
  const run = yield* Run
  const before = yield* run.isSourceDisabled('omdb')
  yield* run.warn('OMDb fora do ar')
  yield* run.warn('TMDB sem chave')
  yield* run.disableSource('omdb')
  return {
    before,
    after: yield* run.isSourceDisabled('omdb'),
    other: yield* run.isSourceDisabled('tmdb'),
    warnings: yield* run.warnings,
  }
})

test('warnings and switched-off sources live for one request', async () => {
  const fixture = useFixture()
  const engine = makeEngine(fixture.vars)

  try {
    const first = await engine.run(warnAndDisable)
    const second = await engine.run(warnAndDisable)

    const expected = {
      before: false,
      after: true,
      other: false,
      warnings: ['OMDb fora do ar', 'TMDB sem chave'],
    }
    expect(first).toEqual({ exitCode: 0, output: expected })
    expect(second).toEqual({ exitCode: 0, output: expected })
  } finally {
    await engine.dispose()
  }
})
