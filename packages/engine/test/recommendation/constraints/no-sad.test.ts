// `tests/test_restricao_tristeza.py`: "nada triste" (`noSad`). Signals in
// the fixture, all on films nobody rated:
// - tags.csv: Pequenos Milagres "sad" by 5 users, Casa Cheia "sad" by 2, Os
//   Inquilinos "massacre" by 2.
// - Tag Genome: Deserto Branco "tearjerker" 0.6, A Última Estação "sad"
//   0.59.
// - Wikidata: Fim de Tarde has the Holocaust (Q2763) as theme, Café Amargo
//   is based on suicide (Q10737), Linha Cruzada has football as theme.
// - Grief (#58): Casa Vazia "grief", Último Verão "tragic loss" and Aliança
//   Partida "death of wife", each with only that tag, by 2 users.
// What the Session stores and the Cartaz's top line are the stored form and
// the label (the Session and the Cartaz are ported apart).

import { describe, expect, test } from 'vite-plus/test'
import {
  constraintLabel,
  readConstraints,
  storedConstraints,
  type Recommendation,
} from '../../../src/index.ts'
import { Effect } from 'effect'
import { useFixture, type Fixture } from '../../fixture.ts'
import {
  bothEngines,
  engineRecommendation,
  film,
  titles,
  PYTHON_TIMEOUT,
} from '../support.ts'

const all = (fixture: Fixture, noSad = true): Promise<Recommendation> =>
  engineRecommendation(fixture, {
    attendees: ['dono'],
    count: 100,
    ...(noSad && { noSad }),
  })

test('a sad tag by 3 or more users removes the film', async () => {
  const fixture = useFixture()
  expect(titles(await all(fixture, false))).toContain('Pequenos Milagres')

  const out = titles(await all(fixture))

  expect(out).not.toContain('Pequenos Milagres')
  expect(out).toContain('Casa Cheia') // "sad" by only 2 users
})

test('a sad tag in the Tag Genome at relevance 0.6 removes the film', async () => {
  const out = titles(await all(useFixture()))

  expect(out).not.toContain('Deserto Branco') // "tearjerker" 0.6, at the limit
  expect(out).toContain('A Última Estação') // "sad" 0.59
})

test('a heavy-theme tag by 2 users removes the film', async () => {
  const fixture = useFixture()
  expect(titles(await all(fixture, false))).toContain('Os Inquilinos')

  expect(titles(await all(fixture))).not.toContain('Os Inquilinos')
})

test("Wikidata's heavy theme removes the film", async () => {
  const out = titles(await all(useFixture()))

  expect(out).not.toContain('Fim de Tarde') // Holocaust as theme
  expect(out).not.toContain('Café Amargo') // based on suicide
  expect(out).toContain('Linha Cruzada') // football as theme
})

test('a grief tag counts as heavy theme', async () => {
  const fixture = useFixture()
  const grief = ['Casa Vazia', 'Último Verão', 'Aliança Partida']
  expect(titles(await all(fixture, false))).toEqual(
    expect.arrayContaining(grief),
  )

  const out = titles(await all(fixture))
  for (const t of grief) expect(out).not.toContain(t)
})

test('the answer counts the removed films by signal', async () => {
  const fixture = useFixture()
  const without = titles(await all(fixture, false))
  const out = await all(fixture)

  expect(new Set(without.filter((t) => !titles(out).includes(t)))).toEqual(
    new Set([
      'Pequenos Milagres',
      'Deserto Branco',
      'Os Inquilinos',
      'Fim de Tarde',
      'Café Amargo',
      'Casa Vazia',
      'Último Verão',
      'Aliança Partida',
    ]),
  )
  expect(out.constraints['no_sad']).toEqual({
    bySignal: { sad: 2, heavy_theme: 6 },
    removed: 8,
  })
})

test('without the request nothing leaves and the Restrição is not there', async () => {
  expect(
    Object.keys((await all(useFixture(), false)).constraints),
  ).not.toContain('no_sad')
})

const line = (out: Recommendation, title: string) => {
  const found = film(out, title).filmLines.filter((l) =>
    l.text.startsWith('nada triste:'),
  )
  expect(found).toHaveLength(1)
  return found[0]
}

test('a film that passes says no sad tag was found', async () => {
  const found = line(await all(useFixture()), 'Casa Cheia')

  expect(found?.text).toBe(
    'nada triste: nenhuma tag de tristeza ou de tema pesado no MovieLens, nenhum tema pesado no Wikidata',
  )
  expect([found?.person, found?.strength, found?.kind]).toEqual([
    null,
    'weak',
    'guess',
  ])
})

test('a film with no tag at all passes and the line says so', async () => {
  expect(line(await all(useFixture()), 'Linha Cruzada')?.text).toBe(
    'nada triste: o filme não tem tags no MovieLens, e o Wikidata não dá tema pesado',
  )
})

test('the Session stores the request without the counts, and it reads "nada triste"', async () => {
  const asked = await Effect.runPromise(readConstraints({ noSad: true }))

  expect(storedConstraints(asked)).toEqual([{ name: 'no_sad' }])
  expect(constraintLabel({ name: 'no_sad' })).toBe('nada triste')
})

describe('equal to Python', { timeout: PYTHON_TIMEOUT }, () => {
  test('--sem-tristeza', async () => {
    const { python, engine } = await bothEngines(
      useFixture(),
      ['--presentes', 'dono', '--quantos', '100', '--sem-tristeza'],
      { attendees: ['dono'], count: 100, noSad: true },
    )
    expect(engine).toEqual(python)
  })
})
