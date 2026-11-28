// The curated lists (#411): the Criterion Collection and the main
// competition of Cannes, Berlin and Venice show as film lines and add a
// bonus to the order once per film, as the awards (#281). Not a Fato.

import { appendFileSync, cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vite-plus/test'
import {
  billboardModel,
  rebuild,
  recommendSession,
  type RecommendedFilm,
} from '../../src/index.ts'
import { ROOT, useFixture } from '../fixture.ts'
import { engineRecommendation, film, titles, weightsWith } from './support.ts'

// Only the four films of `tests/fixture/curated_lists` are from 2025.
const request = { attendees: ['teo'], since: 2025, count: 4 }

const LIST_LINES = new Set([
  'na Criterion Collection',
  'na competição de Cannes',
  'na competição de Berlim',
  'na competição de Veneza',
])

const listsOf = (item: Pick<RecommendedFilm, 'filmLines'>) =>
  item.filmLines.filter((line) => LIST_LINES.has(line.text))

test('the Criterion Collection and the festival competitions raise only the film score and appear on the Cartaz', async () => {
  const fixture = useFixture()
  // Extend a private catalog copy so the recorded recommendations keep their
  // original inputs.
  const catalog = join(fixture.root, 'catalog')
  cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
  for (const file of ['filmes.csv', 'entidades.csv', 'arestas.csv']) {
    const csv = readFileSync(
      join(ROOT, 'tests/fixture/curated_lists', file),
      'utf8',
    )
    appendFileSync(join(catalog, file), csv.slice(csv.indexOf('\n') + 1))
  }
  await fixture.ok(rebuild, { FILMES_CATALOGO: catalog })

  const out = await fixture.ok(recommendSession(request))
  expect(titles(out)).toEqual([
    'A Palma',
    'O Festival',
    'A Coleção',
    'Fora da Lista',
  ])
  const both = film(out, 'A Coleção')
  expect(listsOf(both)).toMatchObject([
    {
      person: null,
      text: 'na Criterion Collection',
      source: 'Wikidata',
      date: '2026-11-20',
      contribution: 0.1,
    },
    {
      person: null,
      text: 'na competição de Cannes',
      source: 'Wikipedia',
      contribution: 0,
    },
  ])
  expect(both.onlyGuesses).toBe(true)
  expect(both.utility.teo).toBeNull()
  // A festival outside the config shows nothing.
  expect(listsOf(film(out, 'O Festival'))).toMatchObject([
    { text: 'na competição de Veneza', contribution: 0.1 },
  ])
  // The Palma de Ouro already says it competed in Cannes.
  const palme = film(out, 'A Palma')
  expect(listsOf(palme)).toEqual([])
  expect(palme.filmLines.map((line) => line.text)).toContain(
    'indicado à Palma de Ouro',
  )
  expect(listsOf(film(out, 'Fora da Lista'))).toEqual([])
  // The competitions come from the English Wikipedia, under CC BY-SA.
  expect(out.attributions.map((a) => a.source)).toContain('Wikipedia')

  const model = await fixture.ok(billboardModel({ session: out.session.id }))
  const cardOf = (id: string) => model.films.find((card) => card.id === id)
  expect(cardOf(both.id)?.curatedLists).toEqual([
    'na Criterion Collection',
    'na competição de Cannes',
  ])
  expect(cardOf(palme.id)?.curatedLists).toBeUndefined()
  expect(cardOf(film(out, 'Fora da Lista').id)?.curatedLists).toBeUndefined()

  const noBonus = await engineRecommendation(
    fixture,
    request,
    weightsWith(
      fixture,
      '[curated_lists]\nweight = 0.1',
      '[curated_lists]\nweight = 0',
    ),
  )
  expect(titles(noBonus)).toEqual([
    'A Palma',
    'Fora da Lista',
    'O Festival',
    'A Coleção',
  ])
  expect(listsOf(film(noBonus, 'A Coleção'))).toHaveLength(2)
})
