import { appendFileSync, cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vite-plus/test'
import { billboardModel, rebuild, recommendSession } from '../../src/index.ts'
import { ROOT, useFixture } from '../fixture.ts'
import { engineRecommendation, film, titles, weightsWith } from './support.ts'

const request = { attendees: ['teo'], since: 2025, count: 3 }

test('major awards and nominations raise only the film score and appear on the Cartaz', async () => {
  const fixture = useFixture()
  // Extend a private catalog copy so the recorded recommendations keep their
  // original inputs.
  const catalog = join(fixture.root, 'catalog')
  cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
  for (const file of ['filmes.csv', 'entidades.csv', 'arestas.csv']) {
    const csv = readFileSync(join(ROOT, 'tests/fixture/awards', file), 'utf8')
    appendFileSync(join(catalog, file), csv.slice(csv.indexOf('\n') + 1))
  }
  await fixture.ok(rebuild, { FILMES_CATALOGO: catalog })

  const out = await fixture.ok(recommendSession(request))
  expect(titles(out)).toEqual(['A Travessia', 'O Pátio', 'Depois da Chuva'])
  const winner = film(out, 'O Pátio')
  const nominee = film(out, 'A Travessia')
  const unlisted = film(out, 'Depois da Chuva')
  const awardsOf = (item: typeof winner) =>
    item.filmLines.filter((line) => line.source === 'Wikidata')
  expect(awardsOf(winner)).toMatchObject([
    {
      person: null,
      text: 'Oscar de melhor filme',
      date: '2026-11-20',
      contribution: 0.1,
    },
    { person: null, text: 'indicado à Palma de Ouro', contribution: 0 },
  ])
  expect(awardsOf(nominee)).toMatchObject([
    { text: 'indicado à Palma de Ouro', contribution: 0.1 },
  ])
  expect(awardsOf(unlisted)).toEqual([])
  expect(winner.onlyGuesses).toBe(true)
  expect(winner.utility.teo).toBeNull()

  const model = await fixture.ok(billboardModel({ session: out.session.id }))
  expect(model.films.find((card) => card.id === winner.id)?.awards).toEqual([
    'Oscar de melhor filme',
    'indicado à Palma de Ouro',
  ])
  expect(
    model.films.find((card) => card.id === unlisted.id)?.awards,
  ).toBeUndefined()

  const noBonus = await engineRecommendation(
    fixture,
    request,
    weightsWith(fixture, '[awards]\nweight = 0.1', '[awards]\nweight = 0'),
  )
  expect(titles(noBonus)).toEqual(['Depois da Chuva', 'A Travessia', 'O Pátio'])
  expect(awardsOf(film(noBonus, 'O Pátio'))).toHaveLength(2)
})
