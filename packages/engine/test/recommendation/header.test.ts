// `tests/test_cabecalho.py`: the card header of each film, the IMDb link,
// genres, poster, Portuguese title and synopsis. Presentation fields,
// outside the Evidence. Bruno's top 5 in the fixture is As Horas Lentas,
// Sal e Ferrugem, Noite de Estreia, Cidade de Vidro and A Volta do Mar.

import { describe, expect, test } from 'vite-plus/test'
import {
  rebuild,
  type ConstraintRequest,
  type Recommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { engineRecommendation, film } from './support.ts'

const TMDB = { FILMES_TMDB_CHAVE: 'x', FILMES_GRAVACOES: RECORDINGS }

const ask = (
  fixture: Fixture,
  vars = {},
  constraints: ConstraintRequest = {},
): Promise<Recommendation> =>
  engineRecommendation(fixture, { attendees: ['dono'], ...constraints }, vars)

describe('the card header', () => {
  test('each film has its IMDb link', async () => {
    expect(film(await ask(useFixture()), 'As Horas Lentas').imdbUrl).toBe(
      'https://www.imdb.com/title/tt9000104/',
    )
  })

  test("the IMDb genres come in Portuguese, in the IMDb's order", async () => {
    const out = await ask(useFixture())

    expect(film(out, 'As Horas Lentas').genres).toEqual(['Drama', 'Mistério'])
    expect(film(out, 'Sal e Ferrugem').genres).toEqual([
      'Aventura',
      'Ficção científica',
      'Suspense',
    ])
  })

  test('a film with no IMDb genre has an empty list', async () => {
    expect(film(await ask(useFixture()), 'Noite de Estreia').genres).toEqual([])
  })

  test("the poster is the TMDB's, at w185", async () => {
    expect(film(await ask(useFixture(), TMDB), 'As Horas Lentas').poster).toBe(
      'https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg',
    )
  })

  test('a film with no poster, or one the TMDB does not find, has none and no warning', async () => {
    const out = await ask(useFixture(), TMDB)

    expect(film(out, 'Sal e Ferrugem').poster).toBeNull() // found, no poster
    expect(film(out, 'Cidade de Vidro').poster).toBeNull() // not found
    expect(out.warnings).toEqual([])
  })

  test('without the TMDB key the poster is null with one warning, and the rest is the same', async () => {
    const fixture = useFixture()
    const withoutKey = await ask(fixture, { FILMES_GRAVACOES: RECORDINGS })
    const withKey = await ask(fixture, TMDB)

    expect(withoutKey.films.every((f) => f.poster === null)).toBe(true)
    expect(withoutKey.warnings).toHaveLength(1)
    const [warning] = withoutKey.warnings
    expect(warning).toContain('TMDB')
    expect(warning).toContain('FILMES_TMDB_CHAVE')
    expect(warning).toContain('sem capa')
    const blank = { poster: null, titlePt: null, synopsis: null }
    expect(withoutKey.films.map((f) => ({ ...f, ...blank }))).toEqual(
      withKey.films.map((f) => ({ ...f, ...blank })),
    )
    expect(withoutKey.attributions).toEqual(
      withKey.attributions.filter((a) => a.source !== 'TMDB'),
    )
  })
})

describe('the card header', () => {
  test("with a poster, the TMDB's attribution comes in", async () => {
    const fixture = useFixture()
    const withPoster = await ask(fixture, TMDB)
    // None of the films that fit has a recorded poster.
    const withoutPoster = await ask(fixture, TMDB, { maxDuration: 100 })

    expect(withoutPoster.films.every((f) => f.poster === null)).toBe(true)
    expect(withoutPoster.attributions.map((a) => a.source)).toEqual(['IMDb'])
    expect(withPoster.attributions).toContainEqual({
      source: 'TMDB',
      text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    })
  })

  test('the Portuguese title and a one-sentence synopsis come from the TMDB in pt-BR', async () => {
    const out = await ask(useFixture(), TMDB)

    const hours = film(out, 'As Horas Lentas')
    expect(hours.titlePt).toBe('As Horas Lentas')
    expect(hours.synopsis).toBe(
      'Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite.',
    )
    const salt = film(out, 'Sal e Ferrugem')
    expect(salt.titlePt).toBe('Sal & Ferrugem')
    // "Dr." does not end the sentence.
    expect(salt.synopsis).toBe(
      'O Dr. Lemos embarca num cargueiro velho atrás de um sinal que vem do fundo do mar!',
    )
  })

  test('a film with no overview, or one the TMDB does not find, has the fields null', async () => {
    const out = await ask(useFixture(), TMDB)

    const opening = film(out, 'Noite de Estreia') // found, empty overview
    expect([opening.titlePt, opening.synopsis]).toEqual([
      'Noite de Estreia',
      null,
    ])
    const glass = film(out, 'Cidade de Vidro') // not found
    expect([glass.titlePt, glass.synopsis]).toEqual([null, null])
  })

  test('without the TMDB key the title and synopsis are null', async () => {
    const out = await ask(useFixture(), { FILMES_GRAVACOES: RECORDINGS })

    expect(
      out.films.every((f) => f.titlePt === null && f.synopsis === null),
    ).toBe(true)
    expect(film(out, 'As Horas Lentas').title).toBe('As Horas Lentas')
  })
})

describe('the card header', () => {
  test('the poster stays six months in the cache and survives a rebuild', async () => {
    const fixture = useFixture()
    await ask(fixture, TMDB)
    // The rebuild replaces the database; the cache beside it stays.
    await fixture.ok(rebuild)
    const offline = {
      FILMES_TMDB_CHAVE: undefined,
      FILMES_GRAVACOES: `${fixture.root}/no-recordings`,
    }

    expect(
      film(
        await ask(fixture, { ...offline, FILMES_HOJE: '2027-05-20' }),
        'As Horas Lentas',
      ).poster,
    ).toBe('https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg')
    // 182 days later.
    expect(
      film(
        await ask(fixture, { ...offline, FILMES_HOJE: '2027-05-21' }),
        'As Horas Lentas',
      ).poster,
    ).toBeNull()
  })

  test('the IMDb rating and votes come from the database', async () => {
    const out = await ask(useFixture())

    const hours = film(out, 'As Horas Lentas')
    expect([hours.imdbRating, hours.imdbVotes]).toEqual([7.4, 28000])
    const salt = film(out, 'Sal e Ferrugem') // no rating in the fixture
    expect([salt.imdbRating, salt.imdbVotes]).toEqual([null, 15000])
  })

  test('the coverage says how many Presentes have a Fact on the film, and who has none', async () => {
    // By Bruno, so the top does not depend on Teo's 0.5.
    const out = await engineRecommendation(useFixture(), {
      attendees: ['dono', 'teo'],
      by: 'dono',
      count: 1,
    })

    expect(out.films).toHaveLength(1)
    const [f] = out.films
    expect(f?.title).toBe('As Horas Lentas')
    expect(f?.coverage).toEqual({
      withFact: 1,
      attendees: 2,
      withoutFact: ['teo'],
    })
  })
})
