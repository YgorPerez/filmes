// A Pessoa's imports as the web app's Imports screen reads them (#117):
// her records, the Letterboxd report and the Trakt and IMDb counts, after real
// imports of the fixture's files.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  importLetterboxd,
  importTrakt,
  personCreate,
  personImports,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { zipOf } from './zip.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const TMDB_ON: Vars = {
  FILMES_TMDB_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
}

const folderZip = (folder: string, prefix = '') =>
  zipOf(
    readdirSync(folder)
      .sort()
      .map(
        (name) => [prefix + name, readFileSync(join(folder, name))] as const,
      ),
  )

describe('personImports', () => {
  test('a Pessoa with no imports: nothing recorded, every count 0', async () => {
    const fixture = useFixture()
    const report = await fixture.ok(personImports('teo'))
    expect(report).toEqual({
      person: 'teo',
      name: 'Teo',
      imports: [],
      letterboxd: {
        person: 'teo',
        films: 0,
        resolved: { wikidata: 0, tmdb: 0, manual: 0 },
        discarded: { wikidata: 0, tmdb: 0, manual: 0 },
        queued: 0,
        queue: [],
        discardedItems: [],
      },
      trakt: { ratings: 0, seen: 0, watchlist: 0 },
      imdb: { ratings: 0 },
      simkl: { ratings: 0, seen: 0, watchlist: 0 },
      tvtime: { ratings: 0, seen: 0, stated: 0, watchlist: 0 },
      films: {
        trakt: { rated: 0, seen: 0, watchlist: 0 },
        imdb: { rated: 0, seen: 0, watchlist: 0 },
        simkl: { rated: 0, seen: 0, watchlist: 0 },
        tvtime: { rated: 0, seen: 0, watchlist: 0 },
      },
      leftOut: { trakt: [], imdb: [], simkl: [], tvtime: [] },
    })
  })
})

describe('personImports', () => {
  test('after a Letterboxd and a Trakt import: both records and their Fatos', async () => {
    const fixture = useFixture()
    await fixture.ok(personCreate({ name: 'Olga' }))
    const letterboxd = await fixture.ok(
      importLetterboxd({
        person: 'olga',
        original: 'letterboxd-olga.zip',
        content: folderZip(join(ROOT, 'tests/fixture/letterboxd/olga')),
        author: AUTHOR,
      }),
      TMDB_ON,
    )
    const trakt = await fixture.ok(
      importTrakt({
        person: 'olga',
        original: 'trakt.zip',
        content: folderZip(join(ROOT, 'tests/fixture/trakt'), 'trakt-export/'),
        author: AUTHOR,
      }),
    )
    const report = await fixture.ok(personImports('Olga'))
    expect(report.imports).toEqual([
      {
        kind: 'letterboxd',
        file: letterboxd.file,
        date: '2026-11-20',
        original: 'letterboxd-olga.zip',
      },
      {
        kind: 'trakt',
        file: trakt.file,
        date: '2026-11-20',
        original: 'trakt.zip',
      },
    ])
    const {
      file: _f,
      newFile: _n,
      facts,
      newFacts: _nf,
      changes: _c,
      warnings: _w,
      attributions: _a,
      ...lbReport
    } = letterboxd
    expect(report.letterboxd).toEqual(lbReport)
    expect(report.trakt).toEqual(trakt.facts)
    // By film (#274): the history's one film has a Nota, so it is no Já
    // visto of its own.
    expect(report.trakt.seen).toBeGreaterThan(0)
    expect(report.films.trakt).toEqual({
      rated: report.trakt.ratings,
      seen: 0,
      watchlist: 0,
    })
    expect(facts.ratings).toBeGreaterThan(0)
  })

  test('an unknown Pessoa is refused', async () => {
    const fixture = useFixture()
    const outcome = await fixture.run(personImports('ninguem'))
    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toMatchObject({ error: { code: 'unknown_person' } })
  })
})
