// Fora da Sessão [out_of_session]: on a refazer of an open Session
// (`session`), the film the Dono swapped in some version of it and the one
// some Presente marked Já vi in it are out (`restricoes/fora_da_sessao.py`,
// #66, the Dono's decision of 2026-11-24, which drops #57's no repeat).
//
// It turns on by itself with `session`, with or without `keep` or `swap`.
// The rest of what the Session already showed may come back. A kept film
// (`keep`, #59) that was on the current screen does not leave through here:
// the Dono asked for it to stay. Other Sessions do not count, and a Já visto
// from outside the Session only weighs against.
//
// - Swapped: each version's `swapped`. `cartaz responder` writes the
//   Cartaz's Trocar there; the refazer writes, in the version that leaves,
//   the films of `swap` (the chat's "outras opções") and, with `keep`, what
//   did not stay of its screen (the Dono chose what stayed; he swapped the
//   rest), even when no kept film survives. A refazer with neither `keep`
//   nor `swap` swaps nothing. An old version, from before the refazer wrote
//   `swapped`, counts by its `dropped` with cause `swapped` when it had kept
//   films.
// - Já vi: the film a version showed and that a Presente of the Session, of
//   now or of some version, has seen since that version's date (the
//   Cartaz's Já vi, or a Já visto recorded during the Session).

import { Effect } from 'effect'
import { pyStrip } from '../../compat/text.ts'
import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../../data/yaml.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { text } from '../../sqlite/row.ts'
import type { Connection, SqliteError } from '../../sqlite/Sqlite.ts'
import { currentVersion, readSession, shownFilms } from '../../sessions/file.ts'
import {
  drop,
  pass,
  type Constraint,
  type ConstraintModule,
  type Verdict,
} from '../constraints.ts'

export interface OutOfSessionRequest {
  /** The Session being redone (`--sessao`). */
  readonly session?: string | null
  /** `--manter`: the previous version's films that stay at their number;
   * an item may hold several separated by commas. */
  readonly keep?: ReadonlyArray<string>
  /** `--trocar`: films recorded as swapped before the refazer (the chat's
   * "outras opções"); an item may hold several separated by commas. */
  readonly swap?: ReadonlyArray<string>
}

/** The ids of `--manter`/`--trocar`, in order, commas accepted, no
 * repeats (`_ids`). */
export const requestIds = (
  items: ReadonlyArray<string> | undefined,
): string[] => [
  ...new Set(
    (items ?? [])
      .flatMap((item) => item.split(','))
      .map(pyStrip)
      .filter((id) => id !== ''),
  ),
]

const idsOf = (value: YamlValue | undefined): string[] =>
  pyTruthy(value) && isSequence(value) ? value.map((id) => pyStrValue(id)) : []

/** What the Dono swapped in the current version: the Cartaz's Trocar,
 * `swap` and, with `keep`, what does not stay of its screen. The refazer
 * writes this in the version that leaves (`trocados_agora`). */
export const swappedNow = (
  version: YamlMapping,
  keep: ReadonlyArray<string>,
  swap: ReadonlyArray<string>,
): Set<string> => {
  const now = new Set([...idsOf(version.get('swapped')), ...swap])
  if (keep.length > 0)
    for (const film of shownFilms(version))
      if (!keep.includes(film.id)) now.add(film.id)
  return now
}

/** Every version's swapped films (`_trocados`). */
const swappedIn = (versions: ReadonlyArray<YamlMapping>): Set<string> => {
  const swapped = new Set<string>()
  for (const version of versions) {
    for (const id of idsOf(version.get('swapped'))) swapped.add(id)
    // A version from before the refazer wrote `swapped`.
    if (pyTruthy(version.get('kept'))) {
      const dropped = version.get('dropped')
      if (pyTruthy(dropped) && isSequence(dropped))
        for (const item of dropped)
          if (isMapping(item) && item.get('cause') === 'swapped')
            swapped.add(pyStrValue(item.get('id') ?? null))
    }
  }
  return swapped
}

/** The film the Session showed and some Presente of it, of now or of some
 * version, has seen since the version that showed it (`_vistos`). */
const seenIn = (
  db: Connection,
  versions: ReadonlyArray<YamlMapping>,
  now: ReadonlyArray<string>,
): Effect.Effect<Set<string>, SqliteError> =>
  Effect.gen(function* () {
    const seen = new Set<string>()
    const everyone = new Set(now)
    for (const version of versions) {
      const attendees = yamlToJson(version.get('attendees') ?? null)
      if (Array.isArray(attendees))
        for (const p of attendees) everyone.add(String(p))
    }
    const people = [...everyone].sort()
    for (const version of versions) {
      const shown = shownFilms(version).map((f) => f.id)
      if (shown.length === 0) continue
      const rows = yield* db.all(
        `SELECT DISTINCT filme_id FROM ja_vistos WHERE data >= ? ` +
          `AND filme_id IN (${shown.map(() => '?').join(', ')}) AND pessoa IN (${people.map(() => '?').join(', ')}) ` +
          'ORDER BY filme_id',
        pyStrValue(version.get('date') ?? null),
        ...shown,
        ...people,
      )
      for (const row of rows) seen.add(text(row, 'filme_id'))
    }
    return seen
  })

const outOfSession = (
  session: string,
  keep: ReadonlyArray<string>,
  swap: ReadonlyArray<string>,
): Constraint => ({
  name: 'out_of_session',
  toJson: () => ({}),
  stored: () => ({ name: 'out_of_session' }),
  result: (drops) => ({
    swapped: drops.get('swapped') ?? 0,
    seen: drops.get('seen') ?? 0,
  }),
  evaluate: (context, films) =>
    Effect.gen(function* () {
      const { frontmatter: front } = yield* readSession(session)
      const earlier = front.get('versions')
      const versions = [
        ...(pyTruthy(earlier) && isSequence(earlier)
          ? earlier.filter(isMapping)
          : []),
        currentVersion(front),
      ]
      const current = versions.at(-1) ?? currentVersion(front)
      const onScreen = new Set(shownFilms(current).map((f) => f.id))
      const kept = new Set(keep.filter((id) => onScreen.has(id)))
      const swapped = swappedIn(versions)
      for (const id of swappedNow(current, keep, swap)) swapped.add(id)
      const seen = yield* seenIn(context.db, versions, context.attendees)
      return new Map(
        [...films.keys()].map((id): [string, Verdict] => [
          id,
          kept.has(id)
            ? pass()
            : seen.has(id)
              ? drop('seen')
              : swapped.has(id)
                ? drop('swapped')
                : pass(),
        ]),
      )
    }),
})

export const outOfSessionModule: ConstraintModule<OutOfSessionRequest> = {
  name: 'out_of_session',
  read: (request) =>
    Effect.gen(function* () {
      const swap = requestIds(request.swap)
      if (swap.length > 0 && !request.session)
        return yield* engineError(
          'invalid_usage',
          '--trocar só vale com --sessao: são filmes que a Sessão mostrou',
        )
      return request.session
        ? outOfSession(request.session, requestIds(request.keep), swap)
        : undefined
    }),
  label: () => 'nada trocado nem já visto nesta Sessão',
}
