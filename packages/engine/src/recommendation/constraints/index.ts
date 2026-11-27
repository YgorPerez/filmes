// The Restrições' files and what holds over all of them
// (`restricoes/__init__.py` `ler`, `rotulo`, `herdar`, `trocam_a_lista`).
//
// A new Restrição is a new file in this folder exporting a
// `ConstraintModule`, its request part added to `ConstraintRequest` and its
// module to `CONSTRAINT_MODULES`, in its Python name's place
// (`CONSTRAINT_ORDER`): that order is the order its errors are found in.

import { Effect } from 'effect'
import type { EngineError } from '../../runtime/EngineError.ts'
import type {
  Constraint,
  ConstraintModule,
  StoredConstraint,
} from '../constraints.ts'
import { childModule, type ChildRequest } from './child.ts'
import { durationModule, type DurationRequest } from './duration.ts'
import { languageModule, type LanguageRequest } from './language.ts'
import { noSadModule, type NoSadRequest } from './no-sad.ts'
import { noSlowModule, type NoSlowRequest } from './no-slow.ts'
import {
  outOfSessionModule,
  type OutOfSessionRequest,
} from './out-of-session.ts'
import { seriesOrderModule, type SeriesOrderRequest } from './series-order.ts'
import { similarModule, type SimilarRequest } from './similar.ts'
import { triggerModule, type TriggerRequest } from './trigger.ts'
import { unseenModule, type UnseenRequest } from './unseen.ts'
import { yearModule, type YearRequest } from './year.ts'

/** What a request can ask of the Restrições: each file's part. */
export type ConstraintRequest = YearRequest &
  ChildRequest &
  DurationRequest &
  OutOfSessionRequest &
  TriggerRequest &
  LanguageRequest &
  SimilarRequest &
  UnseenRequest &
  NoSlowRequest &
  NoSadRequest &
  SeriesOrderRequest

/** The Restrições ported so far, in `CONSTRAINT_ORDER`. */
export const CONSTRAINT_MODULES: ReadonlyArray<
  ConstraintModule<ConstraintRequest>
> = [
  yearModule,
  childModule,
  durationModule,
  outOfSessionModule,
  triggerModule,
  languageModule,
  similarModule,
  unseenModule,
  noSlowModule,
  noSadModule,
  seriesOrderModule,
]

type Modules<R> = ReadonlyArray<ConstraintModule<R>>

/** The Restrições the request asks for, in `CONSTRAINT_ORDER`; the first
 * request that makes no sense fails `invalid_usage` (Python's `ler`). */
export const readConstraints = <R extends ConstraintRequest>(
  request: R,
  modules: Modules<R> = CONSTRAINT_MODULES,
): Effect.Effect<ReadonlyArray<Constraint>, EngineError> =>
  Effect.forEach(modules, (module) => module.read(request)).pipe(
    Effect.map((read) => read.filter((c): c is Constraint => c !== undefined)),
  )

/** A stored Restrição as it reads ("nada triste"); `null` when no file has
 * that name any more (the `no_repeat` a Session stored before #66). */
export const constraintLabel = (
  stored: StoredConstraint,
  modules: ReadonlyArray<
    Pick<ConstraintModule<never>, 'name' | 'label'>
  > = CONSTRAINT_MODULES,
): string | null =>
  modules.find((module) => module.name === stored.name)?.label(stored) ?? null

/** The Restrições the engine turns on by itself (`out_of_session`, #66):
 * they filter, and the "Saiu" lines say so, but a summary of what the Dono
 * asked (the shelf label, the Sessions list) leaves them out (#272). */
const AUTOMATIC = new Set(['out_of_session'])

/** `constraintLabel` for a summary of the request: null for a Restrição
 * the engine turned on by itself. */
export const askedConstraintLabel = (
  stored: StoredConstraint,
): string | null =>
  AUTOMATIC.has(stored.name) ? null : constraintLabel(stored)

/** The stored Restrições of the current version, by name (the last one
 * wins, as in Python's dict). */
const byName = (stored: ReadonlyArray<StoredConstraint>) =>
  new Map(stored.map((s) => [s.name, s]))

/** On a refazer: each file with `inherit` gets its Restrição as the
 * current version stored it, and may put it back in the request (Python's
 * `herdar`, given `frente["contexto"]["restricoes"]`). */
export const inheritConstraints = <R extends ConstraintRequest>(
  request: R,
  stored: ReadonlyArray<StoredConstraint>,
  modules: Modules<R> = CONSTRAINT_MODULES,
): R => {
  const current = byName(stored)
  return modules.reduce<R>(
    (inherited, module) =>
      module.inherit
        ? module.inherit(inherited, current.get(module.name))
        : inherited,
    request,
  )
}

/** The Restrições asked for that, on a refazer, replace the whole list
 * (`replacesList`; Python's `trocam_a_lista`). */
export const replacingList = (
  asked: ReadonlyArray<Constraint>,
  stored: ReadonlyArray<StoredConstraint>,
): ReadonlyArray<Constraint> => {
  const current = byName(stored)
  return asked.filter((c) => c.replacesList?.(current.get(c.name)) ?? false)
}

/** What the Session stores of the Restrições asked for: all but the
 * duration, which `max_duration` holds (Python's `_contexto`), and the
 * ones a refazer brings by itself (`unstored`). */
export const storedConstraints = (
  asked: ReadonlyArray<Constraint>,
): ReadonlyArray<StoredConstraint> =>
  asked
    .filter((c) => c.name !== 'duration' && !c.unstored)
    .map((c) => c.stored())
