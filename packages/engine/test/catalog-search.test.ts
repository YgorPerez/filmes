// Catálogo search (#128): a name to the IDs the other operations take, for
// any Dono, on the fixture's Catálogo.
import { describe, expect, test } from 'vite-plus/test'
import { consult, searchCatalog, searchKey } from '../src/index.ts'
import { useFixture } from './fixture.ts'

const errorOf = (outcome: { exitCode: number; output: unknown }) =>
  (outcome.output as { error: { code: string; message: string } }).error

test('a film by its title, without accents or case, with year and directors', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(
    searchCatalog({ query: 'MARE', kinds: ['film'] }),
  )

  expect(result.films.map((f) => [f.id, f.title, f.year])).toEqual([
    ['tt9000102', 'Maré Baixa', 2015],
    ['tt9001901', 'Maré Cheia', 2022],
    ['tt9001001', 'A Casa das Marés', 2019],
  ])
  expect(result.films[0]).toMatchObject({
    votes: 32000,
    rating: null,
    directors: ['Helena Prado'],
  })
  expect(result).toMatchObject({ people: [], genres: [], series: [] })
})

test('the whole title comes before one that starts with it, and the series too', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(searchCatalog({ query: '  fronteira ' }))

  expect(result.query).toBe('fronteira')
  expect(result.films.map((f) => f.title)).toEqual([
    'Fronteira',
    'Fronteira II',
  ])
  expect(result.series).toEqual([
    {
      id: 'Q9001903',
      label: 'Trilogia da Fronteira',
      links: ['series'],
      filmCount: 2,
      knownFor: [
        { id: 'tt9000401', title: 'Fronteira', year: 2008 },
        { id: 'tt9001903', title: 'Fronteira II', year: 2012 },
      ],
    },
  ])
})

test('a word that starts with the query comes before one that has it inside', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(
    searchCatalog({ query: 'mar', kinds: ['film'] }),
  )

  // The start of the title by votes, then the start of a word, then inside.
  expect(result.films.map((f) => f.title)).toEqual([
    'Maré Baixa',
    'Maré Cheia',
    'Mar Aberto',
    'A Casa das Marés',
    'A Volta do Mar',
    'Café Amargo',
  ])
})

test('"Título (ano)" keeps only the film of that year', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(
    searchCatalog({ query: 'Fronteira (2012)', kinds: ['film'] }),
  )

  expect(result.films.map((f) => f.id)).toEqual(['tt9001903'])
})

test('two films with the same title come apart by year, and the year picks one', async () => {
  const fixture = useFixture()

  const both = await fixture.ok(
    searchCatalog({ query: 'reprise', kinds: ['film'] }),
  )
  const one = await fixture.ok(
    searchCatalog({ query: 'Reprise (2004)', kinds: ['film'] }),
  )

  // Same votes: the id breaks the tie.
  expect(both.films.map((f) => [f.id, f.year, f.directors])).toEqual([
    ['tt9012601', 2011, ['Nina Vale']],
    ['tt9012602', 2004, ['Nina Vale']],
  ])
  expect(one.films.map((f) => f.id)).toEqual(['tt9012602'])
})

test('two people with the same name come apart by their films', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(searchCatalog({ query: 'lia moura' }))

  expect(result.people).toEqual([
    {
      id: 'Q9000006',
      label: 'Lia Moura',
      links: ['director'],
      filmCount: 2,
      knownFor: [
        { id: 'tt9000601', title: 'Pequenos Milagres', year: 2019 },
        { id: 'tt9000602', title: 'Casa Cheia', year: 2021 },
      ],
    },
    {
      id: 'Q9006701',
      label: 'Lia Moura',
      links: ['director'],
      filmCount: 2,
      knownFor: [
        { id: 'tt9006720', title: 'Ponto de Partida', year: 2015 },
        { id: 'tt9006722', title: 'Mesma Diretora', year: 2017 },
      ],
    },
  ])
})

test('a genre, and an entity with no content link is left out', async () => {
  const fixture = useFixture()

  const genres = await fixture.ok(
    searchCatalog({ query: 'faroeste', kinds: ['genre'] }),
  )
  // Q2763 is only a theme (`tema`): no Declarado or Ajuste reaches it.
  const theme = await fixture.ok(searchCatalog({ query: 'holocausto' }))

  expect(
    genres.genres.map((g) => [g.id, g.label, g.links, g.filmCount]),
  ).toEqual([['Q9001904', 'faroeste', ['genre'], 5]])
  expect(theme).toMatchObject({ films: [], people: [], genres: [], series: [] })
})

test('an IMDb or Wikidata id finds that film or entity', async () => {
  const fixture = useFixture()

  const film = await fixture.ok(searchCatalog({ query: 'tt9000101' }))
  const person = await fixture.ok(searchCatalog({ query: 'Q9000001' }))
  const outside = await fixture.ok(searchCatalog({ query: 'tt0000001' }))

  expect(film.films.map((f) => f.title)).toEqual(['O Farol de Areia'])
  expect(person.people.map((p) => p.label)).toEqual(['Helena Prado'])
  expect(person.films).toEqual([])
  expect(outside.films).toEqual([])
})

test('the limit cuts each kind', async () => {
  const fixture = useFixture()

  const limited = await fixture.ok(searchCatalog({ query: 'ma', limit: 1 }))

  expect(limited.films).toHaveLength(1)
  expect(limited.people.length).toBeLessThanOrEqual(1)
})

describe('a refused search', () => {
  test.each([
    [{ query: 'a' }, 'buscar precisa de pelo menos 2 letras ou números'],
    [{ query: ' é ' }, 'buscar precisa de pelo menos 2 letras ou números'],
    [{ query: '!!' }, 'buscar precisa de pelo menos 2 letras ou números'],
    [{ query: 'mar', limit: 0 }, 'o limite da busca vai de 1 a 30'],
    [{ query: 'mar', limit: 31 }, 'o limite da busca vai de 1 a 30'],
    [{ query: 'mar', limit: 2.5 }, 'o limite da busca vai de 1 a 30'],
  ])('%j', async (request, message) => {
    const fixture = useFixture()

    const outcome = await fixture.run(searchCatalog(request))

    expect(outcome.exitCode).toBe(2)
    expect(errorOf(outcome)).toEqual({ code: 'invalid_usage', message })
  })
})

test('the search key folds accents, case and punctuation', async () => {
  const fixture = useFixture()

  expect(searchKey("  Occupe-toi d'Amélie..! ")).toBe('occupe toi d amelie')
  expect(searchKey('STRAßE')).toBe('strasse')
  // The same function in SQL, for `consult` too.
  expect(
    await fixture.ok(
      consult("SELECT search_key('Almodóvar'), search_key(NULL)"),
    ),
  ).toEqual({
    columns: ["search_key('Almodóvar')", 'search_key(NULL)'],
    rows: [['almodovar', null]],
  })
})
