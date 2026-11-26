// Criança: "tem criança de 7", "com uma criança de 7 anos", "com criança"
// (no age: 0, as `--crianca` with none). An age out of 0 to 17 is not read.

import { Effect, Schema } from 'effect'
import { childModule } from '../../recommendation/constraints/child.ts'
import { makeReader, scan } from '../reader.ts'
import { phrasesOf } from '../words.ts'

const MAX_AGE = 17

export const childReader = makeReader({
  field: 'child',
  section: 'child',
  vocabulary: Schema.Struct({
    words: Schema.Array(Schema.String),
    of: Schema.Array(Schema.String),
    years: Schema.Array(Schema.String),
  }),
  read: (words, vocabulary) => {
    const child = phrasesOf(vocabulary.words)
    const of = phrasesOf(vocabulary.of)
    const years = phrasesOf(vocabulary.years)
    return Effect.succeed(
      scan(words, (i) => {
        const length = words.longest(i, child)
        if (length === 0) return undefined
        const at = i + length + words.longest(i + length, of)
        const age = words.span(i, at + 1) ? words.number(at) : undefined
        if (age !== undefined && (age < 0 || age > MAX_AGE)) return undefined
        const end =
          age === undefined ? i + length : at + 1 + words.longest(at + 1, years)
        return {
          start: i,
          end,
          found: {
            request: { child: age ?? 0 },
            label: childModule.label({ name: 'child', age: age ?? 0 }),
          },
        }
      }),
    )
  },
})
