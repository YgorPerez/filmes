// `catalogo/imdb.py`: the films with 100+ votes in the IMDb's published
// TSVs, with the genres of title.basics; an adult title is a Fato of
// `adultos` instead of a film.

import { Effect } from 'effect'
import { factId } from '../compat/fact-id.ts'
import { pyParseFloat, pyParseInt } from '../compat/parse.ts'
import { pythonError } from '../compat/python-error.ts'
import { pyReprStr } from '../compat/text.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { forEachBatch } from './text-source.ts'
import { tsvColumns } from './tsv.ts'
import { dumpPath, IMDB_BASICS, IMDB_RATINGS, type Dumps } from './versions.ts'

export const MIN_VOTES = 100
const NULL = '\\N'

/** Python's `int(text)`. */
export const int = (text: string): number => {
  const value = pyParseInt(text)
  if (value === null)
    throw pythonError(
      'ValueError',
      `invalid literal for int() with base 10: ${pyReprStr(text)}`,
    )
  return value
}

const optionalInt = (text: string): number | null =>
  text === NULL ? null : int(text)

export const loadImdb = (
  db: Connection,
  catalog: string,
  dumps: Dumps,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    const basics = dumps.get(IMDB_BASICS)!
    const ratings = dumps.get(IMDB_RATINGS)!
    const ratingById = new Map<string, readonly [number, number]>()
    yield* forEachBatch(
      tsvColumns(dumpPath(catalog, IMDB_RATINGS, ratings), [
        'tconst',
        'averageRating',
        'numVotes',
      ]),
      (rows) =>
        Effect.sync(() => {
          for (const [id, rating, votes] of rows) {
            const count = int(votes!)
            if (count >= MIN_VOTES)
              ratingById.set(id!, [pyParseFloat(rating!), count])
          }
        }),
    )
    const adults: string[][] = []
    const genres: Array<readonly [string, number, string]> = []
    yield* forEachBatch(
      tsvColumns(dumpPath(catalog, IMDB_BASICS, basics), [
        'tconst',
        'titleType',
        'primaryTitle',
        'isAdult',
        'startYear',
        'runtimeMinutes',
        'genres',
      ]),
      (rows) =>
        db.runMany(
          `INSERT INTO filmes (id, titulo, ano, duracao_min, votos, nota_imdb, data_imdb, data_votos_imdb)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          (function* () {
            for (const [
              film,
              type,
              title,
              adult,
              year,
              runtime,
              names,
            ] of rows) {
              if (type !== 'movie') continue
              const rated = ratingById.get(film!)
              if (rated === undefined) continue
              if (adult === '1') {
                const values = [film!, 'IMDb', basics.date]
                adults.push([factId('adultos', ...values), ...values])
                continue
              }
              if (adult !== '0')
                throw pythonError(
                  'ValueError',
                  `isAdult inesperado no IMDb para ${film}: ${pyReprStr(adult!)}`,
                )
              if (names !== NULL)
                names!
                  .split(',')
                  .forEach((genre, i) => genres.push([film!, i + 1, genre]))
              yield [
                film!,
                title!,
                optionalInt(year!),
                optionalInt(runtime!),
                rated[1],
                rated[0],
                basics.date,
                ratings.date,
              ]
            }
          })(),
        ),
    )
    yield* db.runMany(
      'INSERT INTO adultos (fato_id, filme_id, fonte, data) VALUES (?, ?, ?, ?)',
      adults,
    )
    yield* db.runMany(
      'INSERT INTO generos_imdb (filme_id, ordem, genero) VALUES (?, ?, ?)',
      genres,
    )
  })
