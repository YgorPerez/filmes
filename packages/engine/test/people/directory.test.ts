// What the Pessoas screens show beyond her file (#273): her Notas and Vetos
// on the list, the Sessions she was in, and taking out a Pessoa made by
// mistake.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  peopleCounts,
  personCreate,
  personDelete,
  personSessions,
  readPeople,
  recommendSession,
  recordFeedback,
  Sqlite,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const AS_BRUNO = { owner: 'bruno' }

const rowsOf = (fixture: Fixture, sql: string, slug: string) =>
  fixture.ok(
    Effect.gen(function* () {
      return yield* (yield* Sqlite).read((db) => db.all(sql, slug))
    }),
  )

describe('the counts of the list', () => {
  test('gives each Pessoa her Notas in force and her Vetos', async () => {
    const fixture = useFixture()
    const counts = await fixture.ok(peopleCounts)
    const people = await fixture.ok(readPeople)

    expect(counts.map((c) => c.person)).toEqual(people.map((p) => p.slug))
    expect(counts.find((c) => c.person === 'iara')?.ratings).toBe(2)
    expect(counts.find((c) => c.person === 'quim')).toEqual({
      person: 'quim',
      ratings: 4,
      vetoes: 0,
    })
  })

  test('has no Notas without a database', async () => {
    const fixture = useFixture()
    const counts = await fixture.ok(peopleCounts, {
      FILMES_BANCO: join(fixture.root, 'none.sqlite'),
    })
    expect(counts.every((c) => c.ratings === null)).toBe(true)
  })
})

describe('the Sessions of a Pessoa', () => {
  test('lists the latest with her reaction and her Satisfação', async () => {
    const fixture = useFixture()
    const { session } = await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'] }),
    )
    await fixture.ok(
      recordFeedback({
        session: session.id,
        film: 'tt9000302',
        ratings: ['iara=4'],
      }),
    )

    const iara = await fixture.ok(personSessions('iara'))

    expect(iara.total).toBe(1)
    expect(iara.recent).toEqual([
      {
        id: session.id,
        date: expect.any(String),
        chosen: { id: 'tt9000302', title: expect.any(String) },
        reaction: (4 - 0.5) / 4.5,
      },
    ])
    expect(iara.satisfaction).toEqual({ value: (4 - 0.5) / 4.5, sessions: 1 })
    expect(await fixture.ok(personSessions('quim'))).toEqual({
      total: 0,
      recent: [],
      satisfaction: null,
    })
  })
})

describe('taking a Pessoa out', () => {
  test('removes the file and her rows of one made by mistake', async () => {
    const fixture = useFixture()
    await fixture.ok(personCreate({ name: 'Teste' }), {}, AS_BRUNO)

    const result = await fixture.ok(
      personDelete({ person: 'teste' }),
      {},
      AS_BRUNO,
    )

    expect(result).toEqual({ person: 'teste' })
    expect(existsSync(join(fixture.data, 'people', 'teste.md'))).toBe(false)
    expect(
      await rowsOf(fixture, 'SELECT slug FROM pessoas WHERE slug = ?', 'teste'),
    ).toEqual([])
  })

  test.each([
    ['vera', 'is_owner'],
    ['bruno', 'is_owner'],
  ])('keeps %s: %s', async (person, reason) => {
    const fixture = useFixture()
    const outcome = await fixture.run(personDelete({ person }), {}, AS_BRUNO)
    expect(outcome.exitCode).not.toBe(0)
    expect(outcome.output).toMatchObject({ error: { reason } })
    expect(existsSync(join(fixture.data, 'people', `${person}.md`))).toBe(true)
  })

  test('keeps a Pessoa a Session lists', async () => {
    const fixture = useFixture()
    await fixture.ok(recommendSession({ attendees: ['dono', 'quim'] }))
    const outcome = await fixture.run(
      personDelete({ person: 'quim' }),
      {},
      AS_BRUNO,
    )
    expect(outcome.output).toMatchObject({ error: { reason: 'in_session' } })
    expect(existsSync(join(fixture.data, 'people', 'quim.md'))).toBe(true)
  })
})
