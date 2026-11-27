// Clima: the names of `moods.toml`, the same as the chips, and their
// synonyms. A Clima after a negation in its clause ("nada de terror",
// "sem comédia") is never read as that Clima: `no-moods.ts` reads it as
// the Clima turned away (#272).

import { Effect, Schema } from 'effect'
import { readMoods } from '../../recommendation/moods.ts'
import type { Environment } from '../../runtime/Environment.ts'
import { engineError, type EngineError } from '../../runtime/EngineError.ts'
import { longestOf, makeReader, scan } from '../reader.ts'
import { phraseOf, type Phrase, type Words } from '../words.ts'

/** Whether one of `negations` starts before `i` in its clause. */
const denied = (
  words: Words,
  i: number,
  negations: ReadonlyArray<Phrase>,
): boolean => {
  for (let at = i - 1; at >= 0 && words.clause(at) === words.clause(i); at -= 1)
    if (
      negations.some((phrase) =>
        phrase.every((key, n) => at + n < i && words.key(at + n) === key),
      )
    )
      return true
  return false
}

/** The `[moods]` section: each Clima's synonyms. */
export const MoodSynonyms = Schema.Record(
  Schema.String,
  Schema.Array(Schema.String),
)

/** Every phrase that names a Clima (its name and its synonyms), with the
 * Clima's name; a synonym of a name outside `moods.toml` is
 * `invalid_config`. */
export const moodTable = (
  synonyms: typeof MoodSynonyms.Type,
): Effect.Effect<
  Array<readonly [Phrase, string]>,
  EngineError,
  Environment
> =>
  Effect.gen(function* () {
    const moods = new Map(
      (yield* readMoods).map((mood) => [
        phraseOf(mood.name).join(' '),
        mood.name,
      ]),
    )
    const table: Array<readonly [Phrase, string]> = [...moods].map(
      ([key, name]) => [key.split(' '), name],
    )
    for (const [mood, phrases] of Object.entries(synonyms)) {
      const name = moods.get(phraseOf(mood).join(' '))
      if (name === undefined)
        return yield* engineError(
          'invalid_config',
          `request_reading.toml [moods]: '${mood}' não é um Clima de moods.toml`,
        )
      for (const phrase of phrases) table.push([phraseOf(phrase), name])
    }
    return table
  })

export const moodsReader = makeReader({
  field: 'moods',
  section: 'moods',
  vocabulary: MoodSynonyms,
  read: (words, synonyms, context) =>
    Effect.gen(function* () {
      const table = yield* moodTable(synonyms)
      return scan(words, (i) => {
        if (denied(words, i, context.negations)) return undefined
        const best = longestOf(words, i, table)
        return (
          best && {
            start: i,
            end: i + best.length,
            found: {
              request: { moods: [best.value] },
              label: `Clima: ${best.value}`,
            },
          }
        )
      })
    }),
})
