// `catalogo/elenco.py`: the cast credits. The first 3 actors of each film
// in the IMDb's title.principals, and each Wikidata actor's nconst (P345),
// so the content path knows who is a supporting actor. Both dumps are
// optional in the manifest; without them the tables stay empty and the
// cast's ruler does not change.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { text } from '../sqlite/row.ts'
import { forEachRow } from './graph.ts'
import { int } from './imdb.ts'
import { forEachBatch } from './text-source.ts'
import { tsvColumns } from './tsv.ts'
import { dumpPath, IMDB_PRINCIPALS, type Dumps } from './versions.ts'
import { qid } from './wikidata.ts'

const ACTING = new Set(['actor', 'actress'])
const FIRST = 3

export const loadCast = (
  db: Connection,
  catalog: string,
  dumps: Dumps,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    const principals = dumps.get(IMDB_PRINCIPALS)
    if (principals !== undefined) {
      const films = new Set(
        (yield* db.all('SELECT id FROM filmes ORDER BY id')).map((row) =>
          text(row, 'id'),
        ),
      )
      // By film, in the order films first appear in the file.
      const credits = new Map<string, Array<readonly [number, string]>>()
      yield* forEachBatch(
        tsvColumns(dumpPath(catalog, IMDB_PRINCIPALS, principals), [
          'tconst',
          'ordering',
          'nconst',
          'category',
        ]),
        (rows) =>
          Effect.sync(() => {
            for (const [film, ordering, person, category] of rows)
              if (films.has(film!) && ACTING.has(category!)) {
                const mine = credits.get(film!) ?? []
                mine.push([int(ordering!), person!])
                credits.set(film!, mine)
              }
          }),
      )
      yield* db.runMany(
        'INSERT INTO elenco_principal_imdb (filme_id, ordem, ator_imdb) VALUES (?, ?, ?)',
        (function* () {
          for (const [film, mine] of credits) {
            const sorted = mine.toSorted((a, b) => compareTuple(a, b))
            for (const [i, [, actor]] of sorted.slice(0, FIRST).entries())
              yield [film, i + 1, actor]
          }
        })(),
      )
    }
    yield* forEachRow(catalog, dumps, 'wikidata-atores', (rows) =>
      db.runMany(
        'INSERT INTO atores_imdb (item, imdb) VALUES (?, ?) ON CONFLICT DO NOTHING',
        rows.map((row) => [
          qid(row['item']) ?? null,
          row['valor']?.value ?? null,
        ]),
      ),
    )
  })
