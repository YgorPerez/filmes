// The screens' Catálogo search (#128) on the real engine fixture, and the
// query values the pages read.
import { makeEngine } from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { filmParam, searchParam, similarParam } from '#/content/catalog-search'
import { catalogSearch } from './catalog-search'

const withEngine = async <A>(
  vars: Record<string, string | undefined>,
  task: (run: ReturnType<typeof makeEngine>['run']) => Promise<A>,
) => {
  const engine = makeEngine(vars)
  try {
    return await task(engine.run)
  } finally {
    await engine.dispose()
  }
}

describe('catalogSearch', () => {
  it('finds people, genres and series on the Pessoa page, films only elsewhere', async () => {
    const fixture = useFixture()
    await withEngine(fixture.vars, async (run) => {
      const all = await catalogSearch(run, 'fronteira', 'all')
      const films = await catalogSearch(run, 'lia moura', 'films')
      const people = await catalogSearch(run, 'lia moura', 'all')

      expect(all).toMatchObject({ query: 'fronteira' })
      if (!('found' in all) || !('found' in films) || !('found' in people))
        throw new Error('refused')
      expect(all.found.films.map((f) => f.id)).toEqual([
        'tt9000401',
        'tt9001903',
      ])
      expect(all.found.series.map((s) => s.id)).toEqual(['Q9001903'])
      expect(films.found.people).toEqual([])
      expect(people.found.people.map((p) => p.id)).toEqual([
        'Q9000006',
        'Q9006701',
      ])
    })
  })

  it('says a query is too short, and an engine that cannot run is unavailable', async () => {
    const fixture = useFixture()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const short = await withEngine(fixture.vars, (run) =>
        catalogSearch(run, 'é', 'all'),
      )
      const missing = await withEngine(
        { ...fixture.vars, FILMES_BANCO: `${fixture.root}/none.sqlite` },
        (run) => catalogSearch(run, 'mare', 'films'),
      )

      expect(short).toEqual({ query: 'é', refused: 'curta' })
      expect(missing).toEqual({ query: 'mare', refused: 'indisponivel' })
      expect(log).toHaveBeenCalledWith(
        expect.stringMatching(/^engine: missing_database: /),
      )
    } finally {
      log.mockRestore()
    }
  })
})

describe('the query values', () => {
  it('takes a search text trimmed, and none when blank', () => {
    expect(searchParam('  Maré  ')).toBe('Maré')
    expect(searchParam('   ')).toBeUndefined()
    expect(searchParam(7)).toBeUndefined()
    expect(searchParam('x'.repeat(300))).toHaveLength(200)
  })

  it('keeps only IMDb ids in "Parecido com", each once', () => {
    expect(similarParam('tt1, tt2,tt1,Q3,,')).toBe('tt1,tt2')
    expect(similarParam('Q3')).toBeUndefined()
    expect(similarParam(['tt1'])).toBeUndefined()
  })

  it('takes one IMDb id as the film', () => {
    expect(filmParam('tt9000101')).toBe('tt9000101')
    expect(filmParam('Q1')).toBeUndefined()
    expect(filmParam(undefined)).toBeUndefined()
  })
})
