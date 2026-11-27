// The critics' score (#282): Rotten Tomatoes and Metacritic, read from the
// OMDb answer of a film in the top `[constraints] on_demand_reach`, show as
// film lines and add a bonus that reorders only within that top.

import { appendFileSync, cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import { billboardModel, rebuild, recommendSession } from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { RECORDED } from '../sources/support.ts'
import { engineRecommendation, film, titles, weightsWith } from './support.ts'

// Only the three films of `tests/fixture/critics` are from 2025: by votes,
// Meia-Luz, Os Telhados and Rua Larga, all "só palpites" for Teo.
const request = { attendees: ['teo'], since: 2025, count: 3 }

/** Adds the critics' films to a private catalog copy, so the
 * recorded recommendations keep their inputs. */
const addCriticsFilms = async (fixture: Fixture): Promise<void> => {
  const catalog = join(fixture.root, 'catalog')
  cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
  const csv = readFileSync(
    join(ROOT, 'tests/fixture/critics/filmes.csv'),
    'utf8',
  )
  appendFileSync(join(catalog, 'filmes.csv'), csv.slice(csv.indexOf('\n') + 1))
  await fixture.ok(rebuild, { FILMES_CATALOGO: catalog })
}

const criticsOf = (item: {
  filmLines: ReadonlyArray<{ source: string | null }>
}) => item.filmLines.filter((line) => line.source === 'OMDb')

describe("the critics' score", () => {
  test('a recorded OMDb answer gives the lines and moves the film up', async () => {
    const fixture = useFixture()
    await addCriticsFilms(fixture)

    const out = await fixture.ok(recommendSession(request), RECORDED)

    expect(titles(out)).toEqual(['Rua Larga', 'Meia-Luz', 'Os Telhados'])
    const scored = film(out, 'Rua Larga')
    expect(criticsOf(scored)).toMatchObject([
      {
        person: null,
        text: '93% no Rotten Tomatoes',
        date: '2026-11-20',
        contribution: 0.0465,
      },
      { person: null, text: 'nota 81 no Metacritic', contribution: 0.0405 },
    ])
    expect(scored.onlyGuesses).toBe(true)
    expect(scored.utility.teo).toBeNull()
    // No score, never a penalty: an answer without one, and no answer.
    expect(criticsOf(film(out, 'Os Telhados'))).toEqual([])
    expect(criticsOf(film(out, 'Meia-Luz'))).toEqual([])
    expect(out.warnings).toEqual([])

    const model = await fixture.ok(billboardModel({ session: out.session.id }))
    const cardOf = (id: string) => model.films.find((card) => card.id === id)
    expect(cardOf(scored.id)?.critics).toEqual([
      '93% no Rotten Tomatoes',
      'nota 81 no Metacritic',
    ])
    expect(cardOf(film(out, 'Meia-Luz').id)?.critics).toBeUndefined()
  })

  test('a film past the top the sources reach is not asked and does not move', async () => {
    const fixture = useFixture()
    await addCriticsFilms(fixture)

    const out = await engineRecommendation(fixture, request, {
      ...RECORDED,
      ...weightsWith(fixture, 'on_demand_reach = 50', 'on_demand_reach = 2'),
    })

    expect(titles(out)).toEqual(['Meia-Luz', 'Os Telhados', 'Rua Larga'])
    expect(criticsOf(film(out, 'Rua Larga'))).toEqual([])
  })

  test('with the weight at 0 the lines stay and the order does not move', async () => {
    const fixture = useFixture()
    await addCriticsFilms(fixture)

    const out = await engineRecommendation(fixture, request, {
      ...RECORDED,
      ...weightsWith(
        fixture,
        '[critics]\nweight = 0.1',
        '[critics]\nweight = 0',
      ),
    })

    expect(titles(out)).toEqual(['Meia-Luz', 'Os Telhados', 'Rua Larga'])
    expect(criticsOf(film(out, 'Rua Larga'))).toMatchObject([
      { text: '93% no Rotten Tomatoes', contribution: 0 },
      { text: 'nota 81 no Metacritic', contribution: 0 },
    ])
  })

  test('without the OMDb key there is no score and no warning', async () => {
    const fixture = useFixture()
    await addCriticsFilms(fixture)

    const out = await engineRecommendation(fixture, request, {
      ...RECORDED,
      FILMES_OMDB_CHAVE: undefined,
    })

    expect(titles(out)).toEqual(['Meia-Luz', 'Os Telhados', 'Rua Larga'])
    expect(criticsOf(film(out, 'Rua Larga'))).toEqual([])
    expect(out.warnings).toEqual([])
  })
})
