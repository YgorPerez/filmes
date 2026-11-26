// The Regra "de": "pelo gosto da Iara" orders by her taste, and she is a
// Presente too, as the Regra asks.

import { Effect } from 'effect'
import { nameAt, personFound } from '../names.ts'
import { makeReader, Phrases, scan } from '../reader.ts'
import { phrasesOf } from '../words.ts'

export const byReader = makeReader({
  field: 'by',
  section: 'by',
  vocabulary: Phrases,
  read: (words, { phrases }, context) => {
    const table = phrasesOf(phrases)
    return Effect.succeed(
      scan(words, (i) => {
        const length = words.longest(i, table)
        const name = length > 0 ? nameAt(words, i + length, context) : undefined
        return (
          name && {
            start: i,
            end: name.end,
            found: personFound(name.people, ({ slug, name: label }) => ({
              request: { rule: 'by', by: slug, attendees: [slug] },
              label: `pelo gosto de ${label}`,
            })),
          }
        )
      }),
    )
  },
})
