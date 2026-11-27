import { join } from 'node:path'
import { expect, test, vi } from 'vite-plus/test'
import {
  answerBillboard,
  makeEngine,
  recommendSession,
  recordFeedback,
  type TraktConnection,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'

const setup = async (fixture: Fixture) => {
  const open = await fixture.ok(
    recommendSession({ attendees: ['dono', 'iara', 'teo'] }),
  )
  const { id } = open.session
  const seen = 'tt9001101'
  const { position } = open.films.find((film) => film.id === seen)!
  const reply = await fixture.ok(
    answerBillboard({
      session: id,
      text: `#cartaz ${id} v1\n${position} ${seen} · já vi: iara=8\n`,
    }),
  )
  expect(reply.seen).toEqual([
    expect.objectContaining({ person: 'iara', film: seen, rating: 4 }),
  ])
  // Each recording matches the POST path and exact JSON body; no request
  // reaches the network. Iara consented, Bruno and Teo did not.
  const accessToken = vi.fn<TraktConnection['accessToken']>(async (person) =>
    person === 'iara' ? 'fixture-token' : null,
  )
  const engine = makeEngine(
    {
      ...fixture.vars,
      FILMES_GRAVACOES: join(ROOT, 'tests/fixture/gravacoes'),
    },
    { trakt: { clientId: 'fixture', accessToken } },
  )
  return { engine, id, accessToken }
}

test('sends the chosen film and Cartaz Já vi only to the consenting Pessoa', async () => {
  const { engine, id, accessToken } = await setup(useFixture())
  try {
    const request = { session: id, film: 'tt9000203', ratings: ['iara=9/10'] }
    const outcome = await engine.run(recordFeedback(request))
    expect(outcome.exitCode).toBe(0)
    expect(outcome.output).not.toHaveProperty('warnings')
    expect(accessToken.mock.calls.map(([person]) => person)).toEqual([
      'bruno',
      'iara',
      'iara',
      'teo',
    ])
    const lookups = accessToken.mock.calls.length
    expect(await engine.run(recordFeedback(request))).toMatchObject({
      output: { error: { code: 'closed_session' } },
    })
    expect(accessToken).toHaveBeenCalledTimes(lookups)
  } finally {
    await engine.dispose()
  }
})

test('keeps Feedback after Trakt exhausts its attempts', async () => {
  const { engine, id, accessToken } = await setup(useFixture())
  try {
    const request = { session: id, film: 'tt9000402', reports: ['iara=gostou'] }
    expect(await engine.run(recordFeedback(request))).toMatchObject({
      exitCode: 0,
      output: { warnings: [expect.stringContaining('Trakt')] },
    })
    expect(accessToken.mock.calls.map(([person]) => person)).toEqual([
      'bruno',
      'iara',
    ])
    expect(await engine.run(recordFeedback(request))).toMatchObject({
      output: { error: { code: 'closed_session' } },
    })
  } finally {
    await engine.dispose()
  }
})
