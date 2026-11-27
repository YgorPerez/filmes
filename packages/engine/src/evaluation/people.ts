// The Pessoas the evaluation measures (`avaliacao/pessoas.py`): the cut in
// each one's diary and the ratings held out.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { HIGH_RATING } from '../evidence/ruler.ts'
import { personLetterboxdRows } from '../imports/letterboxd.ts'
import { rowDay, rowKey } from '../imports/letterboxd-export.ts'
import { readPeople } from '../people/people.ts'
import { Environment } from '../runtime/Environment.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { num, text } from '../sqlite/row.ts'

/** A rating kept for training a MovieLens user (a `notas` row without
 * `tipo`): `[fato_id, pessoa, filme_id, nota, data, fonte]`. */
export type TrainingRating = readonly [
  string,
  string,
  string,
  number,
  string,
  string,
]

/** A Pessoa (or a sampled MovieLens user) measured offline. */
export interface MeasuredPerson {
  readonly person: string
  /** The first day held out: what she did before it is training. */
  readonly cut: string
  /** Films held out. */
  readonly heldOut: ReadonlySet<string>
  /** Held-out films rated 4 or more: what the list should find. */
  readonly targets: ReadonlySet<string>
  /** The Nota of each held-out film that has one (a diary line may have
   * none). */
  readonly heldOutRatings: ReadonlyMap<string, number>
  readonly training: ReadonlyArray<TrainingRating>
}

/** `separar`: holds out the most recent 20% of the diary's films, rounded
 * up; `null` with fewer than two films. `diary` maps film → date. */
export const split = (
  person: string,
  diary: ReadonlyMap<string, string>,
  ratings: ReadonlyMap<string, number>,
): MeasuredPerson | null => {
  if (diary.size < 2) return null
  const ordered = [...diary.keys()].sort((a, b) =>
    compareTuple([diary.get(a)!, a], [diary.get(b)!, b]),
  )
  const heldOut = new Set(ordered.slice(-Math.ceil(diary.size / 5)))
  let cut: string | undefined
  for (const film of heldOut) {
    const date = diary.get(film)!
    if (cut === undefined || compareTuple([date], [cut]) < 0) cut = date
  }
  const targets = new Set(
    [...heldOut].filter((film) => (ratings.get(film) ?? 0) >= HIGH_RATING),
  )
  const heldOutRatings = new Map(
    [...heldOut].flatMap((film) => {
      const rating = ratings.get(film)
      return rating === undefined ? [] : [[film, rating] as const]
    }),
  )
  return { person, cut: cut!, heldOut, targets, heldOutRatings, training: [] }
}

const firstDate = (diary: Map<string, string>, film: string, date: string) => {
  const known = diary.get(film)
  diary.set(film, known === undefined || date < known ? date : known)
}

const getOrCreate = <V>(map: Map<string, V>, key: string, make: () => V): V => {
  let value = map.get(key)
  if (value === undefined) {
    value = make()
    map.set(key, value)
  }
  return value
}

/** `_diarios`: when each Pessoa first watched each film, from the Letterboxd
 * diary and reviews (resolved lines) and the Trakt history. */
const diaries = (
  db: Connection,
  today: string,
): Effect.Effect<
  Map<string, Map<string, string>>,
  EngineError | SqliteError,
  Environment
> =>
  Effect.gen(function* () {
    const env = yield* Environment
    const hasData = yield* env.path('data').pipe(
      Effect.as(true),
      Effect.catchIf(
        (error) => error.code === 'missing_config',
        () => Effect.succeed(false),
      ),
    )
    const out = new Map<string, Map<string, string>>()
    const resolved = new Map<string, string>()
    for (const row of yield* db.all(
      "SELECT pessoa, id, filme_id FROM itens_letterboxd WHERE situacao = 'resolvido' ORDER BY pessoa, id",
    ))
      resolved.set(
        `${text(row, 'pessoa')}\0${text(row, 'id')}`,
        text(row, 'filme_id'),
      )
    if (resolved.size > 0 && hasData) {
      for (const person of yield* readPeople) {
        for (const line of yield* personLetterboxdRows(person)) {
          const film = resolved.get(`${person.slug}\0${rowKey(line)}`)
          const day = rowDay(line)
          if (
            film &&
            (line.file === 'diary' || line.file === 'reviews') &&
            day <= today
          )
            firstDate(
              getOrCreate(out, person.slug, () => new Map()),
              film,
              day,
            )
        }
      }
    }
    for (const row of yield* db.all(
      `SELECT pessoa, filme_id, data FROM ja_visto
       WHERE sessao IS NULL AND fonte LIKE 'Trakt %' AND data <= ?
       ORDER BY pessoa, filme_id, data`,
      today,
    ))
      firstDate(
        getOrCreate(out, text(row, 'pessoa'), () => new Map()),
        text(row, 'filme_id'),
        text(row, 'data'),
      )
    return out
  })

/** `pessoas_medidas`: each Pessoa with Letterboxd, Trakt, IMDb or TV Time ratings up to
 * today, cut in her diary (or, without one, in her rating dates), in slug
 * order. */
export const measuredPeople = (
  db: Connection,
  today: string,
): Effect.Effect<MeasuredPerson[], EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    const byDiary = yield* diaries(db, today)
    const history = new Map<string, Map<string, string>>()
    const ratings = new Map<string, Map<string, number>>()
    for (const row of yield* db.all(
      `SELECT n.pessoa, n.filme_id, n.nota, n.data FROM notas n
       JOIN pessoas p ON p.slug = n.pessoa
       WHERE n.tipo = 'nota' AND n.sessao IS NULL
         AND (n.fonte LIKE 'Letterboxd %' OR n.fonte LIKE 'Trakt %' OR n.fonte LIKE 'IMDb %'
              OR n.fonte LIKE 'TV Time %')
         AND n.data <= ?
       ORDER BY n.data DESC, n.fato_id`,
      today,
    )) {
      const person = text(row, 'pessoa')
      const film = text(row, 'filme_id')
      getOrCreate(history, person, () => new Map()).set(film, text(row, 'data'))
      const mine = getOrCreate(ratings, person, () => new Map())
      if (!mine.has(film)) mine.set(film, num(row, 'nota'))
    }
    const out: MeasuredPerson[] = []
    for (const person of [...ratings.keys()].sort((a, b) =>
      compareTuple([a], [b]),
    )) {
      const diary = byDiary.get(person)
      const measured = split(
        person,
        diary !== undefined && diary.size > 0
          ? diary
          : (history.get(person) ?? new Map()),
        ratings.get(person)!,
      )
      if (measured) out.push(measured)
    }
    return out
  })
