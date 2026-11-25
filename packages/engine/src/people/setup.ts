// The Guia de início [setup guide] of the home (#143, map #140): three steps
// a new Dono takes before a Recomendação is worth much. Meu gosto is done
// with 10 Notas or one import; the import, with one Letterboxd or Trakt
// import; the connector, when the Claude app connected with her email, which
// only the app's login database knows, so the caller says it. A step she
// skips goes into her file (`skipped_setup:`), one commit, and holds on
// every device. The guide never blocks anything: it only says what is left.

import { existsSync } from 'node:fs'
import { Effect } from 'effect'
import { Environment } from '../runtime/Environment.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'
import {
  savePersonAndSync,
  writePerson,
  type PersonServices,
  type PersonWriteError,
  type WrittenBy,
} from './actions.ts'
import { resolvePerson } from './people.ts'
import { SETUP_STEPS, type Person, type SetupStep } from './Person.ts'

/** Meu gosto is done with this many Notas in force. */
export const SETUP_RATINGS = 10

export interface SetupStepState {
  readonly step: SetupStep
  readonly done: boolean
  readonly skipped: boolean
}

export interface SetupGuide {
  readonly person: string
  /** In `SETUP_STEPS` order. */
  readonly steps: readonly SetupStepState[]
  /** Every step done or skipped: the home leaves the guide. */
  readonly complete: boolean
}

export interface SetupGuideInput {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The Claude app holds a connection with her email. */
  readonly connected: boolean
}

/** Her Notas in force; none without a database. */
const ratingCount = (
  person: Person,
): Effect.Effect<number, EngineError | SqliteError, Environment | Sqlite> =>
  Effect.gen(function* () {
    const path = yield* (yield* Environment).path('database')
    if (!(yield* Effect.sync(() => existsSync(path)))) return 0
    return yield* (yield* Sqlite).read((db) =>
      Effect.map(
        db.get(
          'SELECT count(*) AS n FROM notas_vigentes WHERE pessoa = ?',
          person.slug,
        ),
        (row) => Number(row?.n ?? 0),
      ),
    )
  })

/** Where the Pessoa stands in the setup guide. */
export const setupGuide = (
  input: SetupGuideInput,
): Effect.Effect<SetupGuide, EngineError | SqliteError, Environment | Sqlite> =>
  Effect.gen(function* () {
    const person = yield* resolvePerson(input.person)
    const imported = person.imports.length > 0
    const done: Record<SetupStep, boolean> = {
      taste: imported || (yield* ratingCount(person)) >= SETUP_RATINGS,
      import: imported,
      connector: input.connected,
    }
    const steps = SETUP_STEPS.map((step) => ({
      step,
      done: done[step],
      skipped: person.skippedSetup.includes(step),
    }))
    return {
      person: person.slug,
      steps,
      complete: steps.every((s) => s.done || s.skipped),
    }
  })

export interface SkipSetupInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  readonly step: SetupStep
}

export interface SkipSetupResult {
  readonly person: string
  readonly step: SetupStep
  /** The file changed: it was not skipped yet. */
  readonly new: boolean
}

/** Keeps a step the Pessoa skipped in her file. */
export const skipSetupStep = (
  input: SkipSetupInput,
): Effect.Effect<SkipSetupResult, PersonWriteError, PersonServices> =>
  writePerson(
    input,
    `pessoa pular passo ${input.person}: ${input.step}`,
    (db) =>
      Effect.gen(function* () {
        const person = yield* resolvePerson(input.person)
        const result = { person: person.slug, step: input.step }
        if (person.skippedSetup.includes(input.step))
          return { ...result, new: false }
        yield* savePersonAndSync(db, {
          ...person,
          skippedSetup: [...person.skippedSetup, input.step],
        })
        return { ...result, new: true }
      }),
  )
