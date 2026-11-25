// `catalogo/subgeneros.py`: the Wikidata genre hierarchy (P279), so a Veto
// on a genre reaches its subgenres. The dump is optional in the manifest;
// without it the table stays empty and the Veto acts only on the vetoed
// genre and the IMDb genre that matches it.

import type { Effect } from 'effect'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { forEachRow } from './graph.ts'
import type { Dumps } from './versions.ts'
import { qid } from './wikidata.ts'

export const loadSubgenres = (
  db: Connection,
  catalog: string,
  dumps: Dumps,
): Effect.Effect<void, SqliteError> =>
  forEachRow(catalog, dumps, 'wikidata-subgeneros', (rows) =>
    db.runMany(
      'INSERT INTO subclasses_wikidata (item, classe) VALUES (?, ?) ON CONFLICT DO NOTHING',
      rows.flatMap((row) => {
        const item = qid(row['item'])
        const genre = qid(row['valor'])
        return item !== undefined && genre !== undefined ? [[item, genre]] : []
      }),
    ),
  )
