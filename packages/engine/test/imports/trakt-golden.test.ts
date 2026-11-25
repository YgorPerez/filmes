// The Trakt reader against the vectors `trakt-golden.py` wrote with the
// Python it replaces: the instants (`datetime.fromisoformat`, to UTC) and
// one JSON file of the export (`json.loads` and `zip_trakt._linhas`).
import { describe, expect, test } from 'vite-plus/test'
import {
  EngineError,
  pyIsoInstantUtc,
  readTraktExport,
} from '../../src/index.ts'
import { golden } from '../compat/golden.ts'
import { zipOf } from './zip.ts'

const FOLDER = new URL('./golden/', import.meta.url)

const FILES: Readonly<Record<string, string>> = {
  rated_at: 'ratings.json',
  watched_at: 'history.json',
  last_watched_at: 'watched-movies.json',
}

interface JsonVector {
  readonly bytes: string
  readonly field: string
  readonly rows?: readonly unknown[]
  readonly error?: string
}

/** What the reader gives for one file, in the vector's shape. */
const read = ({ bytes, field }: JsonVector) => {
  try {
    const zip = zipOf([[FILES[field] ?? '', Buffer.from(bytes, 'base64')]])
    const rows = readTraktExport('trakt.zip', zip).map(
      ({ film, instant, rating }) => ({
        name: film.name,
        imdb: film.imdb,
        tmdb: film.tmdb,
        trakt: film.trakt === null ? null : String(film.trakt),
        instant,
        rating,
      }),
    )
    return { bytes, field, rows }
  } catch (error) {
    if (error instanceof EngineError)
      return { bytes, field, error: error.message }
    throw error
  }
}

// 5,000 vectors each: under coverage on a busy machine they pass 5 s.
describe('golden vectors', { timeout: 30_000 }, () => {
  test('datetime.fromisoformat, to UTC', () => {
    const vectors = golden<{ text: string; instant: string | null }>(
      'iso-instant',
      FOLDER,
    )
    expect(
      vectors.map(({ text }) => ({ text, instant: pyIsoInstantUtc(text) })),
    ).toEqual(vectors)
  })

  test('one JSON file of the Trakt export', () => {
    const vectors = golden<JsonVector>('trakt-json', FOLDER)
    expect(vectors.map(read)).toEqual(vectors)
  })
})
