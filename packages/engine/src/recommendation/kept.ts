// Regenerating with kept films (`recomendacao/mantidos.py`, #59, the Dono's
// decision of 2026-11-23).
//
// On a refazer with `keep` (`--manter`), the kept films stay at the number
// they had in the previous version (the Cartaz's list, `shown`, or the
// Recomendação without a Cartaz) and only the free places get new films. If
// the new list is shorter than a kept film's number, the numbering closes up,
// in the same order, with no hole. A Restrição or a Veto of the redone
// request also removes the kept film that breaks it, and the IMDb minimum
// rating and votes hold for it as for any Candidate; new taste removes no
// kept film, it only changes who gets the free places.
//
// `dropped` says, for each film of the previous version that is not in the
// new one, the cause:
//
//     {position, id, title, cause: 'seen', people: [slugs]}
//     {position, id, title, cause: 'swapped'}
//     {position, id, title, cause: 'constraint', constraint: name, label: 'nada triste'}
//     {position, id, title, cause: 'veto', person: slug, text: 'the Veto as said'}
//     {position, id, title, cause: 'min_rating', label: 'nota 6,5 no IMDb, abaixo de 7'}
//     {position, id, title, cause: 'mood'}
//
// `position` is the film's number in the previous version. `seen` holds when
// some Presente, of now or of the previous version, has a Já visto of the
// film dated on or after the previous version (the Cartaz's "Já vi"); an
// older Já visto was already there when the film was shown, and the drop
// counts as `swapped`.
//
// A new Restrição that replaces the whole list (a new similar, #68) is the
// `constraint` cause of whoever leaves without being a Já vi nor swapped by
// the Dono (`swapped`: the Cartaz's Trocar, `swap` and what did not stay of
// `keep`).
//
// Another Clima (#179) also replaces the whole list: whoever leaves without
// being a Já vi nor swapped by the Dono has the `mood` cause. It stays
// eligible: the Clima only pulls the order, and the film fell below the cut.
//
// The film that comes back from the previous version does not get the "novo"
// mark, kept or not.

import { Effect } from 'effect'
import { thousandsDot } from '../compat/number.ts'
import { pyStrValue, yamlToJson, type YamlMapping } from '../data/yaml.ts'
import { ratingText } from '../evidence/wording.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import type { Weights } from '../runtime/Weights.ts'
import { numOrNull, text } from '../sqlite/row.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import {
  currentVersion,
  isCautiousBet,
  shownFilms,
  storedBet,
  type ShownFilm,
} from '../sessions/file.ts'
import { orderByYes, yesVotes } from '../sessions/votes.ts'
import type { Candidate } from './candidates.ts'
import type { Constraint } from './constraints.ts'
import { constraintLabel } from './constraints/index.ts'
import { applyVetoes } from './vetoes.ts'

/** What a refazer carries into the ranking (Python's `Regerar`). */
export interface Regenerate {
  /** The previous version's films, as the Dono saw them. */
  readonly previous: ReadonlyArray<ShownFilm>
  /** The previous version's date, YYYY-MM-DD. */
  readonly date: string
  /** Film → position, only of the kept films that were in the previous
   * version, in the order asked. */
  readonly positions: ReadonlyMap<string, number>
  /** The previous version's Presentes. */
  readonly attendees: ReadonlyArray<string>
  /** What the Dono swapped from the previous version. */
  readonly swapped: ReadonlySet<string>
  /** The new Restrição that replaces the whole list, if any. */
  readonly replacing: Constraint | undefined
  /** The request asks for other Climas than the previous version's, which
   * also replaces the whole list. */
  readonly newMood: boolean
  /** The previous version's Aposta (#178), if any. */
  readonly bet?: string
  readonly cautiousBet?: boolean
}

/** Why a film of the previous version left (an item of `dropped`, without
 * the film). */
export type DropCause =
  | { readonly cause: 'seen'; readonly people: ReadonlyArray<string> }
  | { readonly cause: 'swapped' }
  | { readonly cause: 'mood' }
  | RemovalCause

/** Why a kept film was removed: a Restrição, a Veto or the minimum rating. */
export type RemovalCause =
  | {
      readonly cause: 'constraint'
      readonly constraint: string
      readonly label: string | null
    }
  | { readonly cause: 'veto'; readonly person: string; readonly text: string }
  | { readonly cause: 'min_rating'; readonly label: string }

export type Dropped = ShownFilm & DropCause

export const isKept = (regenerate: Regenerate, filmId: string): boolean =>
  regenerate.positions.has(filmId)

/** A film the previous version did not show. */
export const isNew = (regenerate: Regenerate, filmId: string): boolean =>
  regenerate.previous.every((f) => f.id !== filmId)

const titleOf = (regenerate: Regenerate, filmId: string): string =>
  regenerate.previous.find((f) => f.id === filmId)?.title || filmId

/** The kept films' numbers after the Votos (#182): the same numbers, but
 * the film with more yes in the Session takes the first one; on a tie, the
 * one that was higher. With no yes, nothing moves. */
const liftKept = (
  kept: ReadonlyArray<readonly [string, number]>,
  yes: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> => {
  const onScreen = kept.toSorted(([, p], [, q]) => p - q)
  const lifted = orderByYes(
    onScreen.map(([id]) => id),
    yes,
  )
  return new Map(onScreen.map(([, position], i) => [lifted[i]!, position]))
}

/** What stays and what was on the screen of the Session's current version,
 * and the warnings of the kept films that were not on it (`preparar`).
 * `swapped` is what the Dono swapped from it; `replacing`, the new
 * Restrição that replaces the whole list; `newMood`, whether the Climas
 * changed. */
export const prepareRegenerate = (
  front: YamlMapping,
  keep: ReadonlyArray<string>,
  swapped: ReadonlySet<string>,
  replacing: Constraint | undefined,
  newMood: boolean,
): { readonly regenerate: Regenerate; readonly warnings: string[] } => {
  const version = currentVersion(front)
  const screen = shownFilms(version)
  const positions = new Map(screen.map((f) => [f.id, f.position]))
  const warnings = keep
    .filter((id) => !positions.has(id))
    .map(
      (id) =>
        `--manter ${id}: o filme não estava na versão anterior da Sessão; ficou de fora`,
    )
  const attendees = yamlToJson(version.get('attendees') ?? null)
  const stored = storedBet(version)
  const bet = stored?.get('id')
  return {
    regenerate: {
      previous: screen,
      date: pyStrValue(version.get('date') ?? null),
      positions: liftKept(
        keep.flatMap((id) => {
          const position = positions.get(id)
          return position === undefined ? [] : [[id, position] as const]
        }),
        yesVotes(front),
      ),
      attendees: Array.isArray(attendees) ? attendees.map(String) : [],
      swapped,
      replacing,
      newMood,
      ...(bet !== undefined && bet !== null && { bet: pyStrValue(bet) }),
      ...(isCautiousBet(stored) && { cautiousBet: true }),
    },
    warnings,
  }
}

/** The cause of a kept film that is no Candidate: the IMDb minimum rating
 * and votes always hold, for a kept film too (`pela_nota_minima`). */
export const byMinRating = (
  db: Connection,
  filmId: string,
  catalog: Weights['catalog'],
): Effect.Effect<RemovalCause, SqliteError> =>
  Effect.gen(function* () {
    const film = yield* db.get(
      'SELECT nota_imdb, votos FROM filmes WHERE id = ?',
      filmId,
    )
    if (film === undefined)
      return { cause: 'min_rating', label: 'fora do Catálogo' }
    const rating = numOrNull(film, 'nota_imdb')
    if (rating !== null && rating < catalog.min_imdb_rating)
      return {
        cause: 'min_rating',
        label: `nota ${ratingText(rating)} no IMDb, abaixo de ${ratingText(catalog.min_imdb_rating)}`,
      }
    return {
      cause: 'min_rating',
      label: `${thousandsDot(numOrNull(film, 'votos') ?? 0)} votos no IMDb, abaixo de ${thousandsDot(catalog.min_votes)}`,
    }
  })

/** The cause of a kept film a Veto removed (`pelo_veto`). */
export const byVeto = (
  db: Connection,
  attendees: ReadonlyArray<string>,
  film: Candidate,
  minimums: Weights['tag_vetoes'],
): Effect.Effect<RemovalCause, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    const { acted } = yield* applyVetoes(
      db,
      attendees,
      new Map([[film.id, film]]),
      minimums,
    )
    const [veto] = acted
    if (veto === undefined)
      throw new TypeError(`no Veto removed the kept film ${film.id}`)
    return { cause: 'veto', person: veto.person, text: veto.text }
  })

/** The cause of a kept film a Restrição removed (`pela_restricao`). */
export const byConstraint = (constraint: Constraint): RemovalCause => ({
  cause: 'constraint',
  constraint: constraint.name,
  label: constraintLabel(constraint.stored()),
})

/** (position, item): the kept films at their number and the free places,
 * in order, at the free numbers (`posicionar`). With no hole: when the new
 * list is shorter than a kept film's number (a smaller `count`, or free
 * places that ran out), the ones after the last filled number move down, in
 * the same order. */
export const place = <A>(
  regenerate: Regenerate,
  fixed: ReadonlyArray<A>,
  free: ReadonlyArray<A>,
  count: number,
  idOf: (item: A) => string,
): ReadonlyArray<readonly [number, A]> => {
  const at = (item: A) => regenerate.positions.get(idOf(item)) ?? 0
  const taken = new Set(fixed.map(at))
  const last = Math.max(count, ...taken, 0)
  const open: number[] = []
  for (let p = 1; p <= last; p++) if (!taken.has(p)) open.push(p)
  const inOrder = [
    ...fixed.map((item) => [at(item), item] as const),
    ...free.slice(0, open.length).map((item, i) => [open[i], item] as const),
  ].toSorted(([a], [b]) => a - b)
  return inOrder.map(([, item], i) => [i + 1, item] as const)
}

/** Who saw the film since `since`, in the order of `people` (`_viram`). */
const sawIt = (
  db: Connection,
  people: ReadonlyArray<string>,
  filmId: string,
  since: string,
): Effect.Effect<string[], SqliteError> =>
  Effect.map(
    db.all(
      `SELECT DISTINCT pessoa FROM ja_vistos WHERE filme_id = ? AND data >= ? AND pessoa IN (${people.map(() => '?').join(', ')})`,
      filmId,
      since,
      ...people,
    ),
    (rows) => {
      const seen = new Set(rows.map((row) => text(row, 'pessoa')))
      return people.filter((p) => seen.has(p))
    },
  )

/** Each film of the previous version that is not in the new one, with the
 * cause (`saidas`). `removed` gives the cause of the kept films a
 * Restrição or a Veto removed. */
export const droppedFilms = (
  db: Connection,
  attendees: ReadonlyArray<string>,
  regenerate: Regenerate,
  stayed: ReadonlySet<string>,
  removed: ReadonlyMap<string, RemovalCause>,
): Effect.Effect<ReadonlyArray<Dropped>, SqliteError> =>
  Effect.gen(function* () {
    const list: Dropped[] = []
    // Whoever was in the previous version and left also saw the film the
    // Dono marked.
    const who = [
      ...attendees,
      ...regenerate.attendees.filter((p) => !attendees.includes(p)),
    ]
    for (const film of regenerate.previous) {
      if (stayed.has(film.id)) continue
      const base = { position: film.position, id: film.id, title: film.title }
      const cause = removed.get(film.id)
      if (cause !== undefined) {
        list.push({ ...base, ...cause })
        continue
      }
      const people = yield* sawIt(db, who, film.id, regenerate.date)
      if (people.length > 0) list.push({ ...base, cause: 'seen', people })
      else if (
        regenerate.replacing !== undefined &&
        !regenerate.swapped.has(film.id)
      )
        list.push({ ...base, ...byConstraint(regenerate.replacing) })
      else if (regenerate.newMood && !regenerate.swapped.has(film.id))
        list.push({ ...base, cause: 'mood' })
      else list.push({ ...base, cause: 'swapped' })
    }
    return list
  })

/** The warning of a kept film that left (`aviso`). */
export const keptWarning = (
  regenerate: Regenerate,
  filmId: string,
  cause: RemovalCause,
): string => {
  const why =
    cause.cause === 'veto'
      ? `Veto de ${cause.person} (${cause.text})`
      : cause.label
  return `${titleOf(regenerate, filmId)} saiu, apesar de mantido: ${why}`
}
