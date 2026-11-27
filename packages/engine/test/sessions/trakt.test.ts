import { join } from 'node:path'
import { expect, test, vi } from 'vite-plus/test'
import {
  answerBillboard,
  makeEngine,
  recommendSession,
  recordFeedback,
  TRAKT_REVOKED,
  type TraktConnection,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'

type Token = Awaited<ReturnType<TraktConnection['accessToken']>>

const setup = async (
  fixture: Fixture,
  token: (person: string) => Token = (person) =>
    person === 'iara' ? 'fixture-token' : null,
) => {
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
    token(person),
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

test('a film Trakt does not know becomes a warning, and the rest still goes', async () => {
  const { engine, id, accessToken } = await setup(useFixture(), (person) =>
    person === 'bruno' ? null : 'fixture-token',
  )
  try {
    const request = { session: id, film: 'tt9000301', ratings: ['iara=9/10'] }
    expect(await engine.run(recordFeedback(request))).toMatchObject({
      exitCode: 0,
      output: {
        warnings: [
          'O Trakt não encontrou Dia de Feira (2016); ele ficou fora do envio.',
        ],
      },
    })
    // Iara's ratings leave the unknown film out; Teo still gets his history.
    expect(accessToken.mock.calls.map(([person]) => person)).toEqual([
      'bruno',
      'iara',
      'iara',
      'teo',
    ])
  } finally {
    await engine.dispose()
  }
})

test('a refused grant asks to reconnect and skips only that Pessoa', async () => {
  const { engine, id, accessToken } = await setup(useFixture(), (person) =>
    person === 'iara'
      ? TRAKT_REVOKED
      : person === 'teo'
        ? 'fixture-token'
        : null,
  )
  try {
    const request = { session: id, film: 'tt9000301' }
    expect(await engine.run(recordFeedback(request))).toMatchObject({
      exitCode: 0,
      output: {
        warnings: [
          'O Trakt de Iara recusou a conexão; reconecte o Trakt para voltar a enviar.',
        ],
      },
    })
    expect(accessToken.mock.calls.map(([person]) => person)).toEqual([
      'bruno',
      'iara',
      'teo',
    ])
  } finally {
    await engine.dispose()
  }
})
