// The group-or-alone bonus: a film line by the Session's size
// (`recomendacao/sinais/grupo.py`). With 2 or more Presentes, a Candidate
// with a "group" tag (`group_alone.toml`) gets "para ver em grupo"; with one,
// one with an "alone" tag gets "para ver sozinho". Only a bonus: the film of
// the other axis loses nothing. One line per film, the strongest
// (`tags.ts`). The weight is `[group]`.

import { Effect, Schema } from 'effect'
import { Environment } from '../../runtime/Environment.ts'
import type { Signal } from './Signal.ts'
import { strongest } from './tags.ts'

const GroupAloneToml = Schema.Struct({
  group: Schema.optionalKey(Schema.Array(Schema.String)),
  alone: Schema.optionalKey(Schema.Array(Schema.String)),
})

export const group: Signal = {
  module: 'grupo',
  forFilm: (round) =>
    Effect.gen(function* () {
      const axes = yield* (yield* Environment).readConfig(
        'group_alone',
        GroupAloneToml,
      )
      const inGroup = round.attendees.length > 1
      const tags = (inGroup ? axes.group : axes.alone) ?? []
      return yield* strongest(
        round,
        inGroup ? 'para ver em grupo' : 'para ver sozinho',
        tags.map((tag) => tag.toLowerCase()),
        [],
        round.weights.group.weight,
      )
    }),
}
