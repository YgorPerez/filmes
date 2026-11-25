// The start-up reload (#104, inventory §6.2). The derived database is built
// on servidor-azul (`db:publish`) from a snapshot of filmes-dados, while the
// app keeps writing Pessoas, imports and Sessions on the VPS. A database
// swapped in later lacks those writes, so the app reloads everything that
// comes from filmes-dados before it serves: the loading steps of a rebuild
// (Python's `10_pessoas`, `31_letterboxd`, `32_trakt`, `40_sessoes`), in
// that order, over the rows the build put there.

import { Effect } from 'effect'
import { reloadLetterboxd } from '../imports/letterboxd.ts'
import { reloadTrakt } from '../imports/trakt.ts'
import { reloadPeople } from '../people/facts.ts'
import { reloadSessions } from '../sessions/database.ts'

export interface DataReload {
  /** The Pessoas loaded, by slug. */
  readonly people: readonly string[]
  /** The Sessions loaded, by id. */
  readonly sessions: readonly string[]
}

/** Reloads the database's rows from filmes-dados: every Pessoa, her
 * Letterboxd and Trakt imports, and every Session. Each step is its own
 * write; the app holds its requests until the last one ends. */
export const reloadData = Effect.gen(function* () {
  const people = yield* reloadPeople
  yield* reloadLetterboxd
  yield* reloadTrakt
  const sessions = yield* reloadSessions
  return { people, sessions } satisfies DataReload
})
