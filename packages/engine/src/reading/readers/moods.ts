// Clima: the names of `moods.toml`, the same as the chips, and their
// synonyms.

import { Effect, Schema } from 'effect'
import { readMoods } from '../../recommendation/moods.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { longestOf, makeReader, scan } from '../reader.ts'
import { phraseOf, type Phrase } from '../words.ts'

export const moodsReader = makeReader({
  field: 'moods',
  section: 'moods',
  vocabulary: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  read: (words, synonyms) =>
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
      return scan(words, (i) => {
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
