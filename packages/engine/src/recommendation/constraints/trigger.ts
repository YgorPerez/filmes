// Gatilho [trigger]: the Dono asks to avoid a Does the Dog Die topic ("a dog
// dies") (`restricoes/gatilho.py`).
//
// The film is out when the topic has 3 or more votes and more yes than no.
// With no data (the site does not know the film, has no such topic, the key
// is missing, or the film is past the top `on_demand_reach` and was not
// asked), the film stays, with a warning line. Does the Dog Die's text is
// quoted as it came, never paraphrased.

import { Effect } from 'effect'
import { pyStrip } from '../../compat/index.ts'
import { makeEvidence, requestLine } from '../../evidence/Evidence.ts'
import type { Evidence } from '../../evidence/Evidence.ts'
import { guessStrength } from '../../evidence/ruler.ts'
import { engineError } from '../../runtime/EngineError.ts'
import {
  DDD_ATTRIBUTION,
  DDD_NAME,
  DoesTheDogDie,
  findTopic,
} from '../../sources/DoesTheDogDie.ts'
import {
  drop,
  pass,
  type Constraint,
  type ConstraintModule,
  type Verdict,
} from '../constraints.ts'

const MIN_VOTES = 3

export interface TriggerRequest {
  /** `--gatilho`, repeatable: Does the Dog Die topics to avoid. */
  readonly triggers?: ReadonlyArray<string>
}

const noInformation = (filmId: string, topic: string): Evidence =>
  makeEvidence({
    person: null,
    filmId,
    text: `sem informação do ${DDD_NAME} sobre "${topic}"`,
    source: null,
    date: null,
    strength: guessStrength(),
    kind: 'guess',
    factId: null,
    base: 0,
  })

const trigger = (themes: ReadonlyArray<string>): Constraint => ({
  name: 'trigger',
  toJson: () => ({ themes: [...themes] }),
  stored: () => ({ name: 'trigger', themes: [...themes] }),
  result: () => ({}),
  evaluate: (_, films) =>
    Effect.succeed(
      new Map<string, Verdict>([...films.keys()].map((id) => [id, 'pending'])),
    ),
  resolve: (_, film, consult) =>
    Effect.gen(function* () {
      const topics = consult
        ? yield* (yield* DoesTheDogDie).topics(film.id)
        : undefined
      const lines: Evidence[] = []
      for (const asked of themes) {
        const topic = topics ? findTopic(topics, asked) : undefined
        if (topics === undefined || topic === undefined)
          lines.push(noInformation(film.id, asked))
        else if (topic.yes + topic.no >= MIN_VOTES && topic.yes > topic.no)
          return drop()
        else
          lines.push(
            requestLine(
              film.id,
              `${DDD_NAME}, "${topic.name}": ${topic.yes} sim, ${topic.no} não. ${DDD_ATTRIBUTION}`,
              DDD_NAME,
              topics.date,
              topics.factId,
            ),
          )
      }
      return pass(lines)
    }),
})

export const triggerModule: ConstraintModule<TriggerRequest> = {
  name: 'trigger',
  read: ({ triggers }) =>
    Effect.gen(function* () {
      if (!triggers || triggers.length === 0) return undefined
      const themes = [...new Set(triggers.map((t) => pyStrip(t)))]
      if (!themes.every((t) => t !== ''))
        return yield* engineError('invalid_usage', '--gatilho vazio')
      return trigger(themes)
    }),
  label: (stored) => {
    const themes = stored['themes']
    return `sem ${(Array.isArray(themes) ? themes : []).map((t) => `“${String(t)}”`).join(', ')}`
  },
}
