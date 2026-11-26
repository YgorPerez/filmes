// The import page's one file field: the server tells a Letterboxd ZIP from
// a Trakt one by what is inside (#163).
import { describe, expect, test } from 'vite-plus/test'
import { exportSource } from '../../src/index.ts'
import { zipOf } from './zip.ts'

describe('exportSource', () => {
  test.each([
    [
      'Letterboxd, its CSVs at the top',
      [['ratings.csv', 'Date,Name,Year\n']],
      'letterboxd',
    ],
    [
      'Letterboxd, its CSVs in a folder',
      [['letterboxd-x/watched.csv', 'Date,Name,Year\n']],
      'letterboxd',
    ],
    [
      'Trakt, its JSONs in a folder',
      [['trakt/ratings-movies.json', '[]']],
      'trakt',
    ],
    ['Trakt, the history alone', [['watched-history-2.json', '[]']], 'trakt'],
    [
      'neither: other CSVs and JSONs',
      [
        ['notas.csv', 'x'],
        ['lists.json', '[]'],
      ],
      null,
    ],
    ['neither: an empty ZIP', [], null],
  ] as const)('%s', (_, members, source) => {
    expect(exportSource(zipOf(members))).toBe(source)
  })

  test('bytes that are not a ZIP are neither', () => {
    expect(
      exportSource(new TextEncoder().encode('Date,Name,Year\n')),
    ).toBeNull()
  })
})
