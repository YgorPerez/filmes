// `catalogo/grafo.py`: ties the Wikidata triples to the tconst and loads
// the Catalog's Fatos (edges, original languages, age ratings), the ids
// the imports resolve with, the labels and the film series.

import { Effect } from 'effect'
import { factId, type PyValue } from '../compat/fact-id.ts'
import { pythonError } from '../compat/python-error.ts'
import { pyReprStr } from '../compat/text.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { text } from '../sqlite/row.ts'
import { convertRating } from './age-rating.ts'
import { forEachBatch } from './text-source.ts'
import { dumpPath, type Dump, type Dumps } from './versions.ts'
import {
  EDGES,
  FILM_SERIES,
  lastSegment,
  MEDIA_FRANCHISE,
  qid,
  RATING_PROPERTIES,
  sparqlRows,
  type Binding,
} from './wikidata.ts'

const SOURCE = 'Wikidata'

/** The dumps whose name starts with one of `prefixes`, by name. */
const dumpsNamed = (
  dumps: Dumps,
  ...prefixes: string[]
): Array<readonly [string, Dump]> =>
  [...dumps]
    .filter(([name]) => prefixes.some((prefix) => name.startsWith(prefix)))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))

/** Every row of every dump named with `prefix`, a batch at a time. */
export const forEachRow = <E, R>(
  catalog: string,
  dumps: Dumps,
  prefix: string,
  use: (rows: Binding[], dump: Dump) => Effect.Effect<void, E, R>,
): Effect.Effect<void, E, R> =>
  Effect.forEach(
    dumpsNamed(dumps, prefix),
    ([name, dump]) =>
      forEachBatch(sparqlRows(dumpPath(catalog, name, dump)), (rows) =>
        use(rows, dump),
      ),
    { discard: true },
  )

const value = (row: Binding, key: string): string => {
  const term = row[key]
  if (term === undefined) throw pythonError('KeyError', pyReprStr(key))
  return term.value
}

const loadIds = (db: Connection, catalog: string, dumps: Dumps) =>
  Effect.gen(function* () {
    yield* forEachRow(catalog, dumps, 'wikidata-ids', (rows, dump) =>
      db.runMany(
        `INSERT INTO metadados_wikidata (item, propriedade, valor, fonte, data)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        rows.map((row) => [
          lastSegment(row['item']),
          lastSegment(row['p']),
          value(row, 'valor'),
          SOURCE,
          dump.date,
        ]),
      ),
    )
    yield* db.run(`
      INSERT INTO slugs_letterboxd (slug, item, imdb, tmdb, tmdb_serie, ano)
      SELECT s.valor, s.item, MIN(CASE WHEN m.propriedade = 'P345' THEN m.valor END),
             MIN(CASE WHEN m.propriedade = 'P4947' THEN m.valor END),
             MIN(CASE WHEN m.propriedade = 'P4983' THEN m.valor END),
             MIN(CASE WHEN m.propriedade = 'P577' AND m.valor GLOB '[0-9][0-9][0-9][0-9]-*'
                      THEN CAST(substr(m.valor, 1, 4) AS INTEGER) END)
      FROM metadados_wikidata s JOIN metadados_wikidata m USING (item)
      WHERE s.propriedade = 'P6127'
      GROUP BY s.item, s.valor
    `)
  })

const loadLabels = (db: Connection, catalog: string, dumps: Dumps) =>
  forEachRow(catalog, dumps, 'wikidata-rotulos', (rows) =>
    db.runMany(
      `INSERT INTO rotulos_wikidata (item, pt, en, mul, codigo)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (item) DO UPDATE SET pt = COALESCE(excluded.pt, pt),
           en = COALESCE(excluded.en, en), mul = COALESCE(excluded.mul, mul),
           codigo = COALESCE(excluded.codigo, codigo)`,
      rows.map((row) => [
        lastSegment(row['valor']),
        ...(['pt', 'en', 'mul', 'codigo'] as const).map(
          (field) => row[field]?.value ?? null,
        ),
      ]),
    ),
  )

/** The root a series class falls under: the dump's `?raiz` or, in a dump
 * from before #165, the class itself when it is one of the roots. */
const seriesRoot = (row: Binding): string | null => {
  const root = qid(row['raiz'])
  if (root !== undefined) return root
  const type = qid(row['valor'])
  return type === FILM_SERIES || type === MEDIA_FRANCHISE ? type : null
}

const loadSeries = (db: Connection, catalog: string, dumps: Dumps) =>
  forEachRow(catalog, dumps, 'wikidata-series', (rows) =>
    db.runMany(
      'INSERT INTO series_de_filmes (item, classe, raiz) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
      rows.map((row) => [
        qid(row['item']) ?? null,
        qid(row['valor']) ?? null,
        seriesRoot(row),
      ]),
    ),
  )

/** A film's release date from its P577 values (#165): the earliest year
 * and, in it, the earliest day. Wikidata writes a date known only to the
 * year as the 1st of January, so a year with nothing but that keeps only
 * the year. `undefined` with no dated value. */
const releaseDate = (values: ReadonlyArray<string>): string | undefined => {
  const dates = values
    .filter((v) => /^\d{4}-\d{2}-\d{2}/.test(v))
    .map((v) => v.slice(0, 10))
    .sort()
  const year = dates[0]?.slice(0, 4)
  if (year === undefined) return undefined
  const day = dates.find((d) => d.startsWith(year) && !d.endsWith('-01-01'))
  return day ?? year
}

/** Each film's release date, of the item its IMDb id (P345) names. */
const loadReleaseDates = (db: Connection) =>
  Effect.gen(function* () {
    const byFilm = new Map<string, string[]>()
    for (const row of yield* db.all(`
      SELECT f.id, d.valor FROM metadados_wikidata i
      JOIN filmes f ON f.id = i.valor
      JOIN metadados_wikidata d ON d.item = i.item AND d.propriedade = 'P577'
      WHERE i.propriedade = 'P345'
    `)) {
      const id = text(row, 'id')
      byFilm.set(id, [...(byFilm.get(id) ?? []), text(row, 'valor')])
    }
    yield* db.runMany(
      'INSERT INTO estreias (filme_id, data) VALUES (?, ?)',
      [...byFilm].flatMap(([id, values]) => {
        const date = releaseDate(values)
        return date === undefined ? [] : [[id, date]]
      }),
    )
  })

/** An entity's label, its pt/en/mul labels and its language code. */
interface Entity {
  readonly label: string
  readonly labels: ReadonlyArray<string | null>
  readonly code: string | null
}

const insertFact = (
  db: Connection,
  table: string,
  columns: string,
  values: PyValue[],
) =>
  db.run(
    `INSERT INTO ${table} (fato_id, ${columns}) VALUES (${values.map(() => '?').join(', ')}, ?) ON CONFLICT DO NOTHING`,
    factId(table, ...values),
    ...(values as Array<string | null>),
  )

/** `_carregar_conteudo`: one triple, for each film of its item. */
const loadContent = (
  db: Connection,
  row: Binding,
  films: readonly string[],
  entities: Map<string, Entity>,
  date: string,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    const property = lastSegment(row['p'])
    const raw = value(row, 'valor')
    const target = qid(row['valor'])
    let label = raw
    let labels: ReadonlyArray<string | null> = []
    let code: string | null = null
    if (target !== undefined) {
      let entity = entities.get(target)
      if (entity === undefined) {
        const found = yield* db.get(
          'SELECT pt, en, mul, codigo FROM rotulos_wikidata WHERE item = ?',
          target,
        )
        const [pt, en, mul, languageCode] = (
          ['pt', 'en', 'mul', 'codigo'] as const
        ).map(
          (column) => (found?.[column] as string | null | undefined) ?? null,
        )
        entity = {
          label: pt || en || mul || target,
          labels: [pt ?? null, en ?? null, mul ?? null],
          code: languageCode ?? null,
        }
        yield* db.run(
          'INSERT INTO entidades (id, rotulo) VALUES (?, ?)',
          target,
          entity.label,
        )
        entities.set(target, entity)
      }
      ;({ label, labels, code } = entity)
    }
    const predicate = EDGES.get(property)
    for (const film of films) {
      if (target !== undefined && predicate !== undefined)
        yield* insertFact(
          db,
          'arestas',
          'filme_id, predicado, entidade_id, fonte, data',
          [film, predicate, target, SOURCE, date],
        )
      if (target !== undefined && property === 'P364')
        yield* insertFact(
          db,
          'idiomas_originais',
          'filme_id, idioma_id, codigo, rotulo, fonte, data',
          [film, target, code, label, SOURCE, date],
        )
      if (RATING_PROPERTIES.has(property)) {
        // The code the table knows may be only in the English or mul label.
        const rating =
          labels.find(
            (candidate) =>
              candidate && convertRating(property, candidate) !== undefined,
          ) ?? label
        yield* insertFact(
          db,
          'classificacoes',
          'filme_id, propriedade, rotulo, fonte, data, valor_wikidata',
          [film, property, rating, SOURCE, date, target ?? null],
        )
      }
    }
  })

export const loadGraph = (
  db: Connection,
  catalog: string,
  dumps: Dumps,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    yield* loadIds(db, catalog, dumps)
    yield* loadLabels(db, catalog, dumps)
    yield* loadSeries(db, catalog, dumps)
    yield* loadReleaseDates(db)
    const filmsByItem = new Map<string, string[]>()
    for (const row of yield* db.all(`
      SELECT m.item, f.id FROM metadados_wikidata m JOIN filmes f ON f.id = m.valor
      WHERE m.propriedade = 'P345'
      ORDER BY m.item, f.id
    `)) {
      const item = text(row, 'item')
      const films = filmsByItem.get(item) ?? []
      films.push(text(row, 'id'))
      filmsByItem.set(item, films)
    }
    const entities = new Map<string, Entity>()
    for (const [name, dump] of dumpsNamed(
      dumps,
      'wikidata-conteudo',
      'wikidata-elenco',
    ))
      yield* forEachBatch(sparqlRows(dumpPath(catalog, name, dump)), (rows) =>
        Effect.forEach(
          rows,
          (row) => {
            const films = filmsByItem.get(lastSegment(row['item']))
            return films === undefined
              ? Effect.void
              : loadContent(db, row, films, entities, dump.date)
          },
          { discard: true },
        ),
      )
  })
