// `person edit` (#330): a Declarado, a Relato, a Veto or a Já visto
// corrected in place, keeping its date and line, with `editado <today>`
// outside the fato_id.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  personCreate,
  personEdit,
  personReport,
  personSeen,
  personState,
  personVeto,
  personView,
  Sqlite,
  type EngineServices,
  type Run,
} from '../../src/index.ts'
import { FIXTURE_TODAY, useFixture, type Fixture } from '../fixture.ts'

const TERROR = 'Q9001801'
const COMEDY = 'Q9001802'
const FAROL = 'tt9000101'
const PEQUENOS_MILAGRES = 'tt9000601'

const read = (fixture: Fixture, slug: string) =>
  readFileSync(join(fixture.data, 'people', `${slug}.md`), 'utf8')

const query = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      return yield* (yield* Sqlite).read((db) => db.all(sql))
    }),
  )

const errorOf = async <A, E>(
  fixture: Fixture,
  effect: Effect.Effect<A, E, EngineServices | Run>,
) => {
  const outcome = await fixture.run(effect)
  if (outcome.exitCode !== 0) return outcome.output.error
  throw new Error('expected an error')
}

const ana = (fixture: Fixture) =>
  fixture.ok(personCreate({ name: 'Ana', slug: 'ana' }))

describe('person edit', () => {
  test('a Declarado keeps its date and line, and says when it was edited', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const first = await fixture.ok(
      personState({
        person: 'ana',
        text: 'adoro terror',
        target: TERROR,
        reaction: 'love',
        date: '2024-03-12',
      }),
    )
    await fixture.ok(personState({ person: 'ana', text: 'gosto de comédia' }))

    const result = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'stated',
        id: first.stated.factId,
        text: 'adoro terror dos anos 80',
        reaction: 'like',
      }),
    )

    expect(result).toMatchObject({
      changed: true,
      edited: {
        text: 'adoro terror dos anos 80',
        reaction: 'like',
        target: TERROR,
        date: '2024-03-12',
        edited: FIXTURE_TODAY,
      },
    })
    const lines = read(fixture, 'ana')
      .split('\n')
      .filter((l) => l.startsWith('- '))
    expect(lines).toEqual([
      `- 2024-03-12 · conversa com o Dono · genérico · gosta de Terror (${TERROR}) · "adoro terror dos anos 80" · editado ${FIXTURE_TODAY}`,
      expect.stringContaining('"gosto de comédia"'),
    ])
    const view = await fixture.ok(personView('ana'))
    expect(view.stated[0]).toEqual(result.edited)
    expect(
      await query(
        fixture,
        "SELECT fato_id FROM declarados WHERE pessoa = 'ana'",
      ),
    ).toContainEqual({ fato_id: result.edited.factId })
  })

  test('the edit date is not part of the fato_id', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const first = await fixture.ok(
      personState({ person: 'ana', text: 'adoro esse', target: FAROL }),
    )
    const edited = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'stated',
        id: first.stated.factId,
        text: 'adoro',
      }),
    )
    const back = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'stated',
        id: edited.edited.factId,
        text: 'adoro esse',
      }),
    )

    expect(back.edited.factId).toBe(first.stated.factId)
    expect(back.edited).toMatchObject({ edited: FIXTURE_TODAY })
  })

  test('an edit that changes nothing writes nothing', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const first = await fixture.ok(
      personState({ person: 'ana', text: 'adoro esse', target: FAROL }),
    )
    const before = read(fixture, 'ana')

    const result = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'stated',
        id: first.stated.factId,
        text: 'adoro esse',
      }),
    )

    expect(result.changed).toBe(false)
    expect(result.edited).not.toHaveProperty('edited')
    expect(read(fixture, 'ana')).toBe(before)
  })

  test('a Relato can lose its target and its reaction', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const first = await fixture.ok(
      personReport({
        person: 'ana',
        text: 'ama comédia',
        target: COMEDY,
        reaction: 'love',
      }),
    )

    const result = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'report',
        id: first.report.factId,
        target: null,
        reaction: null,
      }),
    )

    expect(result.edited).toMatchObject({
      text: 'ama comédia',
      target: null,
      reaction: null,
      label: null,
    })
  })

  test('a Veto changes its target in the frontmatter, and its label follows', async () => {
    const fixture = useFixture()
    await ana(fixture)
    await fixture.ok(
      personVeto({
        person: 'ana',
        text: 'nunca vê terror',
        target: TERROR,
        date: '2024-01-02',
      }),
    )

    const result = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'veto',
        id: TERROR,
        target: 'slow',
        text: 'nada lento',
      }),
    )

    expect(result.edited).toMatchObject({
      text: 'nada lento',
      target: 'slow',
      label: 'lento',
      date: '2024-01-02',
      edited: FIXTURE_TODAY,
    })
    expect(read(fixture, 'ana')).toContain(`edited: '${FIXTURE_TODAY}'`)
    expect(
      await query(fixture, "SELECT alvo FROM vetos WHERE pessoa = 'ana'"),
    ).toEqual([{ alvo: 'lento' }])
  })

  test('a Veto cannot take the target of another one', async () => {
    const fixture = useFixture()
    await ana(fixture)
    await fixture.ok(
      personVeto({ person: 'ana', text: 'nunca terror', target: TERROR }),
    )
    await fixture.ok(
      personVeto({ person: 'ana', text: 'nunca comédia', target: COMEDY }),
    )
    const before = read(fixture, 'ana')

    expect(
      await errorOf(
        fixture,
        personEdit({ person: 'ana', kind: 'veto', id: TERROR, target: COMEDY }),
      ),
    ).toMatchObject({ code: 'invalid_usage', reason: 'duplicate_item' })
    expect(read(fixture, 'ana')).toBe(before)
  })

  test('a Já visto changes its Nota and its Fonte, not its film', async () => {
    const fixture = useFixture()
    await ana(fixture)
    const first = await fixture.ok(
      personSeen({
        person: 'ana',
        film: PEQUENOS_MILAGRES,
        rating: '4',
        date: '2023-05-01',
      }),
    )

    const result = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'seen',
        id: first.seen.factId,
        rating: '7/10',
        source: 'cinema com a Bia',
      }),
    )

    expect(result.edited).toMatchObject({
      film: PEQUENOS_MILAGRES,
      rating: 3.5,
      source: 'cinema com a Bia',
      date: '2023-05-01',
      edited: FIXTURE_TODAY,
    })
    expect(read(fixture, 'ana')).toContain(
      `· nota 3,5 · editado ${FIXTURE_TODAY}`,
    )
    expect(
      await query(
        fixture,
        `SELECT nota FROM notas WHERE pessoa = 'ana' AND filme_id = '${PEQUENOS_MILAGRES}'`,
      ),
    ).toEqual([{ nota: 3.5 }])

    expect(
      await errorOf(
        fixture,
        personEdit({
          person: 'ana',
          kind: 'seen',
          id: PEQUENOS_MILAGRES,
          target: FAROL,
        }),
      ),
    ).toMatchObject({ code: 'invalid_usage' })
  })

  test('a Já visto can lose its Nota', async () => {
    const fixture = useFixture()
    await ana(fixture)
    await fixture.ok(
      personSeen({ person: 'ana', film: PEQUENOS_MILAGRES, rating: '4' }),
    )

    const result = await fixture.ok(
      personEdit({
        person: 'ana',
        kind: 'seen',
        id: PEQUENOS_MILAGRES,
        rating: null,
      }),
    )

    expect(result.edited).toMatchObject({ rating: null })
    expect(read(fixture, 'ana')).toContain(
      `(${PEQUENOS_MILAGRES}) · editado ${FIXTURE_TODAY}`,
    )
  })

  test('what is not in her file is not found', async () => {
    const fixture = useFixture()
    await ana(fixture)

    expect(
      await errorOf(
        fixture,
        personEdit({
          person: 'ana',
          kind: 'stated',
          id: 'letterboxd:abc',
          text: 'x',
        }),
      ),
    ).toMatchObject({ code: 'unknown_stated' })
  })
})
