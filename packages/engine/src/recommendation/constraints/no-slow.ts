// Nada lento [no_slow]: only when the Dono asks, the slow-paced film is out
// (`restricoes/sem_lento.py`, #57). The list is the `slow` group of
// `tag_vetoes.toml`, with the `[tag_vetoes]` minimums: relevance in the Tag
// Genome or users in MovieLens' tags.csv. The same group is a Veto target.

import { Effect } from 'effect'
import { pass, type Constraint, type ConstraintModule } from '../constraints.ts'
import { markedByGroup } from '../vetoes.ts'

export interface NoSlowRequest {
  /** `--sem-lento`. */
  readonly noSlow?: boolean
}

const GROUP = 'slow'

const noSlow: Constraint = {
  name: 'no_slow',
  toJson: () => ({}),
  stored: () => ({ name: 'no_slow' }),
  result: () => ({}),
  evaluate: (context, films) =>
    Effect.gen(function* () {
      const slow = yield* markedByGroup(
        context.db,
        GROUP,
        context.weights.tag_vetoes,
      )
      return new Map(
        [...films.keys()]
          .filter((id) => !slow.has(id))
          .map((id) => [id, pass()]),
      )
    }),
}

export const noSlowModule: ConstraintModule<NoSlowRequest> = {
  name: 'no_slow',
  read: (request) => Effect.succeed(request.noSlow ? noSlow : undefined),
  label: () => 'nada lento',
}
