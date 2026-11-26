// Idioma original: "filme nacional", "em português", "francês", as the
// code the Restrição takes.

import { Effect, Schema } from 'effect'
import { longestOf, makeReader, restrictionLabel, scan } from '../reader.ts'
import { phraseOf } from '../words.ts'

export const languageReader = makeReader({
  field: 'language',
  section: 'language',
  vocabulary: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  read: (words, codes) => {
    const table = Object.entries(codes).flatMap(([code, phrases]) =>
      phrases.map((phrase) => [phraseOf(phrase), code] as const),
    )
    return Effect.succeed(
      scan(words, (i) => {
        const best = longestOf(words, i, table)
        return (
          best && {
            start: i,
            end: i + best.length,
            found: {
              request: { language: best.value },
              label: restrictionLabel({
                name: 'language',
                language: best.value,
              }),
            },
          }
        )
      }),
    )
  },
})
