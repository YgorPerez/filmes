// Série na ordem [series_order]: a film of a film series is out when some
// Presente has not seen the film before it in that series (#165, the Dono's
// decision of 2026-11-25). On by default.
//
// - Only a film series counts (`series_de_filmes` with root Q24856); a
//   media franchise (Marvel, Star Wars) does not.
// - Seen is Já visto (any Nota, the Cartaz's Já vi, a recorded Já visto).
//   A Presente with no history has seen nothing.
// - The order is the release date (`estreias`). A film with no date is
//   neither before nor after any other, and so is a pair with the same
//   date, or the same year when one of them is known only to the year:
//   nothing leaves by mistake.
// - The film only leaves; the one before it is not pushed in.
//
// Three modes (`seriesOrder`): `previous` (the default) asks for the film
// right before it (when several share that date, any of them does); `all`
// asks for every film before it; `off` turns the rule off.
//
// In a Session the mode is stored in the version's `context.constraints`
// like the similar, and a refazer without `seriesOrder` keeps it
// (`inherit`). The default mode is not stored: a refazer brings it by
// itself, and the Cartaz's top says nothing about it. A change of mode does
// not replace the list: the kept films answer to it like to any Restrição,
// and the dropped one says who did not see what.

import { Effect } from 'effect'
import { FILM_SERIES } from '../../catalog/wikidata.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { text, textOrNull } from '../../sqlite/row.ts'
import type { Connection, SqliteError } from '../../sqlite/Sqlite.ts'
import type { Candidate } from '../candidates.ts'
import {
  drop,
  filmsJson,
  pass,
  type Constraint,
  type ConstraintContext,
  type ConstraintModule,
  type StoredConstraint,
  type Verdict,
} from '../constraints.ts'

export const SERIES_ORDER_MODES = ['previous', 'all', 'off'] as const
export type SeriesOrderMode = (typeof SERIES_ORDER_MODES)[number]
export const DEFAULT_SERIES_ORDER: SeriesOrderMode = 'previous'

export interface SeriesOrderRequest {
  /** How the Série na ordem holds; `previous` when absent. */
  readonly seriesOrder?: SeriesOrderMode
}

/** Presentes who did not see the same films before the one that left. */
export interface UnseenBefore {
  /** Slugs, in the Presentes' order. */
  readonly people: ReadonlyArray<string>
  /** Titles, the oldest first. */
  readonly films: ReadonlyArray<string>
}

const LABELS: Readonly<Record<SeriesOrderMode, string>> = {
  previous: 'série na ordem: só se viram o anterior',
  all: 'série na ordem: só se viram todos os anteriores',
  off: 'série na ordem: tanto faz',
}

/** "A", "A e B", "A, B e C". */
const andList = (items: ReadonlyArray<string>): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} e ${items.at(-1) ?? ''}`

/** "X", "X nem Y", "X, Y nem Z". */
const norList = (items: ReadonlyArray<string>): string =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} nem ${items.at(-1) ?? ''}`

/** Who did not see what ("Teo não viu Cais 2"), with each Pessoa as
 * `nameOf` writes her. */
export const unseenText = (
  unseen: ReadonlyArray<UnseenBefore>,
  nameOf: (slug: string) => string,
): string =>
  unseen
    .map(
      ({ people, films }) =>
        `${andList(people.map(nameOf))} não ${people.length === 1 ? 'viu' : 'viram'} ${norList(films)}`,
    )
    .join('; ')

/** Whether release date `a` comes before `b`: by the year and, when both
 * are known to the day, by the day. */
const before = (a: string, b: string): boolean => {
  const [yearA, yearB] = [a.slice(0, 4), b.slice(0, 4)]
  if (yearA !== yearB) return yearA < yearB
  return a.length === 10 && b.length === 10 && a < b
}

interface Member {
  readonly id: string
  readonly title: string
  readonly date: string | null
}

const modeOf = (stored: StoredConstraint | undefined): SeriesOrderMode => {
  const mode = stored?.['mode']
  return SERIES_ORDER_MODES.find((m) => m === mode) ?? DEFAULT_SERIES_ORDER
}

/** The films before `film` that each Presente must have seen, or none. */
const required = (
  mode: SeriesOrderMode,
  film: Member,
  members: ReadonlyArray<Member>,
): ReadonlyArray<Member> => {
  const date = film.date
  if (date === null) return []
  const earlier = members.filter(
    (m) => m.id !== film.id && m.date !== null && before(m.date, date),
  )
  if (mode === 'all') return earlier
  return earlier.filter((m) =>
    earlier.every(
      (other) => other.date === null || !before(m.date ?? '', other.date),
    ),
  )
}

const PASSED = pass()

/** Film series id → its films, of the series of some film of `films`. */
const readSeries = (
  db: Connection,
  films: ReadonlyMap<string, Candidate>,
): Effect.Effect<ReadonlyMap<string, ReadonlyArray<Member>>, SqliteError> =>
  Effect.gen(function* () {
    const series = new Map<string, Member[]>()
    for (const row of yield* db.all(
      `SELECT DISTINCT a.entidade_id AS serie, a.filme_id, f.titulo, e.data
         FROM arestas a
         JOIN filmes f ON f.id = a.filme_id
         LEFT JOIN estreias e ON e.filme_id = a.filme_id
         WHERE a.predicado = 'serie'
           AND a.entidade_id IN (SELECT item FROM series_de_filmes WHERE raiz = ?)
           AND a.entidade_id IN (
             SELECT entidade_id FROM arestas
             WHERE predicado = 'serie' AND filme_id IN (SELECT value FROM json_each(?)))
         ORDER BY a.entidade_id, e.data, a.filme_id`,
      FILM_SERIES,
      filmsJson(films),
    )) {
      const id = text(row, 'serie')
      series.set(id, [
        ...(series.get(id) ?? []),
        {
          id: text(row, 'filme_id'),
          title: text(row, 'titulo'),
          date: textOrNull(row, 'data'),
        },
      ])
    }
    return series
  })

/** Who among the Presentes did not see the films `film` needs, grouped by
 * the same missing films. */
const unseenBefore = (
  mode: SeriesOrderMode,
  attendees: ReadonlyArray<string>,
  needed: ReadonlyArray<Member>,
  saw: (person: string, film: Member) => boolean,
): UnseenBefore[] => {
  const groups = new Map<string, { people: string[]; films: string[] }>()
  for (const person of attendees) {
    const missing =
      mode === 'all'
        ? needed.filter((m) => !saw(person, m))
        : needed.some((m) => saw(person, m))
          ? []
          : needed
    if (missing.length === 0) continue
    const titles = missing.map((m) => m.title)
    const key = JSON.stringify(titles)
    const group = groups.get(key)
    if (group) group.people.push(person)
    else groups.set(key, { people: [person], films: titles })
  }
  return [...groups.values()]
}

const evaluateSeriesOrder = (
  mode: SeriesOrderMode,
  context: ConstraintContext,
  films: ReadonlyMap<string, Candidate>,
) =>
  Effect.gen(function* () {
    const { db, attendees } = context
    const everyone = new Map(
      [...films.keys()].map((id): [string, Verdict] => [id, PASSED]),
    )
    if (mode === 'off') return everyone
    const series = yield* readSeries(db, films)
    if (series.size === 0) return everyone
    const members = [...series.values()].flat()
    const seen = new Set(
      (yield* db.all(
        `SELECT DISTINCT pessoa, filme_id FROM ja_vistos
           WHERE pessoa IN (SELECT value FROM json_each(?))
             AND filme_id IN (SELECT value FROM json_each(?))`,
        JSON.stringify(attendees),
        JSON.stringify([...new Set(members.map((m) => m.id))]),
      )).map((row) => `${text(row, 'pessoa')} ${text(row, 'filme_id')}`),
    )
    const saw = (person: string, film: Member) =>
      seen.has(`${person} ${film.id}`)
    const names = new Map(
      (yield* db.all(
        'SELECT slug, nome FROM pessoas WHERE slug IN (SELECT value FROM json_each(?))',
        JSON.stringify(attendees),
      )).map((row) => [text(row, 'slug'), text(row, 'nome')]),
    )
    for (const [, inSeries] of series) {
      for (const film of inSeries) {
        const verdict = everyone.get(film.id)
        // A film only evaluated once, though it may be in two series.
        if (verdict !== PASSED) continue
        const needed = required(mode, film, inSeries)
        if (needed.length === 0) continue
        const unseen = unseenBefore(mode, attendees, needed, saw)
        if (unseen.length === 0) continue
        everyone.set(
          film.id,
          drop(null, {
            label: unseenText(unseen, (slug) => names.get(slug) ?? slug),
            unseen,
          }),
        )
      }
    }
    return everyone
  })

const seriesOrder = (mode: SeriesOrderMode): Constraint => ({
  name: 'series_order',
  toJson: () => ({ mode }),
  stored: () => ({ name: 'series_order', mode }),
  unstored: mode === DEFAULT_SERIES_ORDER,
  result: () => ({}),
  evaluate: (context, films) => evaluateSeriesOrder(mode, context, films),
})

export const seriesOrderModule: ConstraintModule<SeriesOrderRequest> = {
  name: 'series_order',
  read: (request) =>
    Effect.gen(function* () {
      const mode = request.seriesOrder ?? DEFAULT_SERIES_ORDER
      if (!SERIES_ORDER_MODES.includes(mode))
        return yield* engineError(
          'invalid_usage',
          `série na ordem: ${String(mode)} não é um modo (${SERIES_ORDER_MODES.join(', ')})`,
        )
      return seriesOrder(mode)
    }),
  label: (stored) => LABELS[modeOf(stored)],
  inherit: (request, stored) =>
    request.seriesOrder !== undefined || stored === undefined
      ? request
      : { ...request, seriesOrder: modeOf(stored) },
}
