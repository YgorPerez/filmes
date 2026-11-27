// The watchlist [watchlist] as a Declarado in favour (#280): a film on a
// Presente's Letterboxd, Trakt or Simkl (#299) watchlist. Teo has no Nota, so his only
// Evidence on Jardim Suspenso (tt9000301) is the one his import gives.

import { describe, expect, test } from 'vite-plus/test'
import {
  importLetterboxd,
  importSimkl,
  importTrakt,
  personImports,
  personSeen,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { zipOf } from '../imports/zip.ts'
import { engineRecommendation, film } from './support.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const HEADER = 'Date,Name,Year,Letterboxd URI\n'
const JARDIM = '2024-10-01,Jardim Suspenso,2017,https://boxd.it/9b1\n'

const letterboxdZip = (watchlist: string) =>
  zipOf([['watchlist.csv', HEADER + watchlist]])

const traktWatchlist = (items: readonly object[], name = 'watchlist.json') =>
  zipOf([[`trakt-export/${name}`, JSON.stringify(items)]])

const JARDIM_ON_TRAKT = {
  rank: 1,
  id: 7001,
  listed_at: '2025-03-10T21:00:00.000Z',
  notes: null,
  type: 'movie',
  movie: {
    title: 'Jardim Suspenso',
    year: 2017,
    ids: { trakt: 71, imdb: 'tt9000301', tmdb: 9008 },
  },
}

const simklBackup = (status: string) =>
  JSON.stringify({
    movies: [
      {
        added_to_watchlist_at: '2025-05-06T12:00:00Z',
        last_watched_at: null,
        user_rating: null,
        status,
        movie: {
          title: 'Jardim Suspenso',
          year: 2017,
          ids: { simkl: 9100301, imdb: 'tt9000301' },
        },
      },
    ],
  })

const importSimklBackup = (fixture: Fixture, json: string) =>
  fixture.ok(
    importSimkl({
      person: 'teo',
      original: 'SimklBackup.json',
      content: new TextEncoder().encode(json),
      author: AUTHOR,
    }),
  )

const importLetterboxdZip = (fixture: Fixture, content: Uint8Array) =>
  fixture.ok(
    importLetterboxd({
      person: 'teo',
      original: 'letterboxd-teo.zip',
      content,
      author: AUTHOR,
    }),
  )

const importTraktZip = (fixture: Fixture, content: Uint8Array) =>
  fixture.ok(
    importTrakt({
      person: 'teo',
      original: 'trakt-teo.zip',
      content,
      author: AUTHOR,
    }),
  )

/** Teo's Evidence on Jardim Suspenso, alone in the round. */
const teoOnJardim = async (fixture: Fixture) =>
  film(
    await engineRecommendation(fixture, { attendees: ['teo'], count: 50 }),
    'Jardim Suspenso',
  ).evidence['teo']

describe('the watchlist', () => {
  test('a film on the Letterboxd watchlist is a moderate Declarado in favour', async () => {
    const fixture = useFixture()
    await importLetterboxdZip(fixture, letterboxdZip(JARDIM))

    const lines = await teoOnJardim(fixture)

    expect(lines).toHaveLength(1)
    expect(lines?.[0]).toMatchObject({
      person: 'teo',
      text: 'está na lista do Letterboxd',
      source: 'Letterboxd de Teo',
      date: '2024-10-01',
      strength: 'moderate',
      kind: 'stated',
      // `[people] statement_weight` 1, times moderate's 0.6.
      contribution: 0.6,
    })
    expect(lines?.[0]?.factId).toMatch(/^letterboxd:/)
  })

  test('a film on the Trakt watchlist is the same Declarado, from Trakt', async () => {
    const fixture = useFixture()
    const report = await importTraktZip(
      fixture,
      traktWatchlist([JARDIM_ON_TRAKT]),
    )

    expect(report.newFacts).toEqual({ ratings: 0, seen: 0, watchlist: 1 })
    const lines = await teoOnJardim(fixture)
    expect(lines).toHaveLength(1)
    expect(lines?.[0]).toMatchObject({
      text: 'está na lista do Trakt',
      source: 'Trakt de Teo',
      date: '2025-03-10',
      strength: 'moderate',
      kind: 'stated',
      contribution: 0.6,
    })
    expect(lines?.[0]?.factId).toMatch(/^trakt:/)
    expect((await fixture.ok(personImports('teo'))).trakt).toEqual({
      ratings: 0,
      seen: 0,
      watchlist: 1,
    })
  })

  test('the export may name it lists-watchlist.json', async () => {
    const fixture = useFixture()
    await importTraktZip(
      fixture,
      traktWatchlist([JARDIM_ON_TRAKT], 'lists-watchlist.json'),
    )

    expect((await teoOnJardim(fixture))?.map((e) => e.text)).toEqual([
      'está na lista do Trakt',
    ])
  })

  test('on both watchlists, the film gets one line: the latest', async () => {
    const fixture = useFixture()
    await importLetterboxdZip(fixture, letterboxdZip(JARDIM))
    await importTraktZip(fixture, traktWatchlist([JARDIM_ON_TRAKT]))

    expect((await teoOnJardim(fixture))?.map((e) => e.text)).toEqual([
      'está na lista do Trakt',
    ])
  })

  test('a Já visto of the film wins: a seen film is no longer wanted', async () => {
    const fixture = useFixture()
    await importLetterboxdZip(fixture, letterboxdZip(JARDIM))
    await importTraktZip(fixture, traktWatchlist([JARDIM_ON_TRAKT]))
    await fixture.ok(personSeen({ person: 'teo', film: 'tt9000301' }))

    expect((await teoOnJardim(fixture))?.map((e) => e.text)).toEqual(['já viu'])
  })

  test('a new Letterboxd export replaces the watchlist of the earlier one', async () => {
    const fixture = useFixture()
    await importLetterboxdZip(fixture, letterboxdZip(JARDIM))
    await importLetterboxdZip(fixture, letterboxdZip(''))

    expect((await teoOnJardim(fixture))?.map((e) => e.text)).toEqual([
      'sem fato',
    ])
  })

  test('a Letterboxd export without a watchlist leaves the earlier one', async () => {
    const fixture = useFixture()
    await importLetterboxdZip(fixture, letterboxdZip(JARDIM))
    await importLetterboxdZip(
      fixture,
      zipOf([
        [
          'watched.csv',
          `${HEADER}2025-01-02,O Farol de Areia,2012,https://boxd.it/9a1\n`,
        ],
      ]),
    )

    expect((await teoOnJardim(fixture))?.map((e) => e.text)).toEqual([
      'está na lista do Letterboxd',
    ])
  })

  test('a new Trakt export replaces the watchlist of the earlier one', async () => {
    const fixture = useFixture()
    await importTraktZip(fixture, traktWatchlist([JARDIM_ON_TRAKT]))
    const report = await importTraktZip(fixture, traktWatchlist([]))

    expect(report.facts.watchlist).toBe(0)
    expect((await teoOnJardim(fixture))?.map((e) => e.text)).toEqual([
      'sem fato',
    ])
  })

  test('a film on the Simkl watchlist (plantowatch) is the same Declarado, from Simkl', async () => {
    const fixture = useFixture()
    await importSimklBackup(fixture, simklBackup('plantowatch'))

    const lines = await teoOnJardim(fixture)
    expect(lines).toHaveLength(1)
    expect(lines?.[0]).toMatchObject({
      text: 'está na lista do Simkl',
      source: 'Simkl de Teo',
      date: '2025-05-06',
      strength: 'moderate',
      kind: 'stated',
      contribution: 0.6,
    })
  })

  test('a new Simkl backup replaces the watchlist of the earlier one', async () => {
    const fixture = useFixture()
    await importSimklBackup(fixture, simklBackup('plantowatch'))
    await importSimklBackup(fixture, simklBackup('completed'))

    expect((await teoOnJardim(fixture))?.map((e) => e.text)).toEqual(['já viu'])
  })
})
