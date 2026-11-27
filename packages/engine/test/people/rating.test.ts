// The rating screen (#144): the Fila de Notas a Dono with no history rates
// from, and the Notas she gives there, written in one commit.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import { consult, filmCard, personRate, ratingQueue } from '../../src/index.ts'
import { RECORDINGS } from '../sources/support.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const IARA = { name: 'Iara', email: 'iara@example.org' }

/** git in filmes-dados, with none of the caller's `GIT_*`. */
const git = (fixture: Fixture, ...args: string[]): string => {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(process.env))
    if (!name.startsWith('GIT_')) env[name] = value
  return execFileSync('git', args, {
    cwd: fixture.data,
    encoding: 'utf8',
    env: {
      ...env,
      GIT_AUTHOR_NAME: 'Setup',
      GIT_AUTHOR_EMAIL: 'setup@example.org',
      GIT_COMMITTER_NAME: 'Setup',
      GIT_COMMITTER_EMAIL: 'setup@example.org',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  })
}

/** The fixture's data as a repository with one commit. */
const repository = (fixture: Fixture) => {
  git(fixture, 'init', '--quiet', '-b', 'master')
  git(fixture, 'add', '--all')
  git(fixture, 'commit', '--quiet', '-m', 'initial')
}

describe('the Fila de Notas', () => {
  test('the films with the most IMDb votes, never two of a decade in a row', async () => {
    const fixture = useFixture()

    const queue = await fixture.ok(ratingQueue({ person: 'teo', limit: 5 }))

    // By votes: Pequenos Milagres (2019, 80.000), Deserto Branco (2015),
    // Cidade de Vidro (2018), Casa Cheia (2021), O Farol de Areia (2012),
    // Fronteira (2008). Casa Cheia jumps the two 2010s behind it, and
    // Fronteira the 2010s after Deserto Branco.
    expect(queue.films.map((f) => [f.id, f.year])).toEqual([
      ['tt9000601', 2019],
      ['tt9000602', 2021],
      ['tt9000701', 2015],
      ['tt9000401', 2008],
      ['tt9000103', 2018],
    ])
    expect(queue.films[4]).toEqual({
      id: 'tt9000103',
      title: 'Cidade de Vidro',
      year: 2018,
      genres: ['Crime', 'Drama'],
      directors: expect.any(Array),
      runtime: expect.any(Number),
    })
  })

  test('each film comes with its directors and runtime, so she knows it', async () => {
    const fixture = useFixture()

    const queue = await fixture.ok(ratingQueue({ person: 'teo', limit: 1 }))

    expect(queue.films[0]).toMatchObject({ id: 'tt9000601', runtime: 96 })
  })

  test('a film she has seen is not in it', async () => {
    const fixture = useFixture()

    const queue = await fixture.ok(ratingQueue({ person: 'bruno', limit: 200 }))

    // Bruno gave Notas to O Farol de Areia, Maré Baixa and Cidade de Vidro.
    expect(queue.rated).toBeGreaterThanOrEqual(3)
    const ids = queue.films.map((f) => f.id)
    expect(ids).toContain('tt9000601')
    expect(ids).not.toContain('tt9000101')
    expect(ids).not.toContain('tt9000102')
    expect(ids).not.toContain('tt9000103')
  })

  test('refuses a limit out of range', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(ratingQueue({ person: 'teo', limit: 0 }))

    expect(outcome).toMatchObject({
      exitCode: 2,
      output: { error: { code: 'invalid_usage' } },
    })
  })
})

describe('the Notas of the rating screen', () => {
  test('go to her file in one commit, on the scale of 1 to 10', async () => {
    const fixture = useFixture()
    repository(fixture)

    const result = await fixture.ok(
      personRate({
        person: 'teo',
        ratings: [
          { film: 'tt9000601', rating: 8 },
          { film: 'tt9000701', rating: 3 },
        ],
        author: IARA,
      }),
    )

    expect(result).toEqual({ person: 'teo', added: 2 })
    expect(git(fixture, 'log', '--format=%an|%s').trim().split('\n')).toEqual([
      'Iara|pessoa notas teo: 2',
      'Setup|initial',
    ])
    const file = readFileSync(join(fixture.data, 'people', 'teo.md'), 'utf8')
    expect(file).toContain('Pequenos Milagres')
    expect(file).toContain('Deserto Branco')
    const rows = await fixture.ok(
      consult(
        "SELECT filme_id, nota, fonte FROM notas WHERE pessoa = 'teo' ORDER BY filme_id",
      ),
    )
    expect(rows.rows).toEqual([
      ['tt9000601', 4, 'notas no site'],
      ['tt9000701', 1.5, 'notas no site'],
    ])
    const queue = await fixture.ok(ratingQueue({ person: 'teo', limit: 3 }))
    expect(queue.films.map((f) => f.id)).not.toContain('tt9000601')
  })
})

describe('the Notas of the rating screen', () => {
  test('refuses a Nota off the scale and a film not in the Catálogo, writing nothing', async () => {
    const fixture = useFixture()
    const before = readFileSync(join(fixture.data, 'people', 'teo.md'), 'utf8')

    const off = await fixture.run(
      personRate({
        person: 'teo',
        ratings: [
          { film: 'tt9000601', rating: 8 },
          { film: 'tt9000701', rating: 11 },
        ],
      }),
    )
    const unknown = await fixture.run(
      personRate({
        person: 'teo',
        ratings: [{ film: 'tt1', rating: 8 }],
      }),
    )
    const none = await fixture.run(personRate({ person: 'teo', ratings: [] }))

    expect(off).toMatchObject({ output: { error: { code: 'invalid_usage' } } })
    expect(unknown).toMatchObject({
      output: { error: { code: 'unknown_target' } },
    })
    expect(none).toMatchObject({ output: { error: { code: 'invalid_usage' } } })
    expect(readFileSync(join(fixture.data, 'people', 'teo.md'), 'utf8')).toBe(
      before,
    )
  })
})

describe('the film card', () => {
  test('the Catalog with TMDB: Portuguese poster and synopsis', async () => {
    const fixture = useFixture()

    const card = await fixture.ok(filmCard({ film: 'tt9000601' }), {
      FILMES_TMDB_CHAVE: 'chave-de-teste',
      FILMES_GRAVACOES: RECORDINGS,
    })

    expect(card).toMatchObject({
      id: 'tt9000601',
      title: 'Pequenos Milagres',
      titlePt: null,
      year: 2019,
      runtime: 96,
      poster: 'https://image.tmdb.org/t/p/w185/pEqUeNoSmIlAgReS9601.jpg',
      synopsis: expect.stringContaining('costureira'),
    })
    expect(card.attributions).toHaveLength(1)
  })

  test('without TMDB, the Catalog alone', async () => {
    const fixture = useFixture()

    const card = await fixture.ok(filmCard({ film: 'tt9000601' }), {
      FILMES_TMDB_CHAVE: undefined,
    })

    expect(card).toMatchObject({ poster: null, synopsis: null })
    expect(card.attributions).toEqual([])
  })

  test('a film out of the Catalog is unknown_target', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(filmCard({ film: 'tt0000001' }))

    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toMatchObject({ error: { code: 'unknown_target' } })
  })
})
