// How many films: "5 filmes", "três opções", "só 3". "Um filme", with the
// number in words, is an article, not a count.

import { Effect, Schema } from 'effect'
import { makeReader, scan, type Claim } from '../reader.ts'
import { phrasesOf } from '../words.ts'

const DIGITS = /^\d+$/u

const claim = (start: number, end: number, count: number): Claim => ({
  start,
  end,
  found: {
    request: { count },
    label: count === 1 ? '1 filme' : `${count} filmes`,
  },
})

export const countReader = makeReader({
  field: 'count',
  section: 'count',
  vocabulary: Schema.Struct({
    films: Schema.Array(Schema.String),
    only: Schema.Array(Schema.String),
  }),
  read: (words, vocabulary) => {
    const films = phrasesOf(vocabulary.films)
    const only = phrasesOf(vocabulary.only)
    return Effect.succeed(
      scan(words, (i) => {
        const prefix = words.longest(i, only)
        const at = i + prefix
        const count = words.number(at)
        if (count === undefined || count < 1 || !words.span(i, at + 1))
          return undefined
        const noun = words.longest(at + 1, films)
        if (prefix > 0) return claim(i, at + 1 + noun, count)
        return noun > 0 && (count > 1 || DIGITS.test(words.key(at)))
          ? claim(i, at + 1 + noun, count)
          : undefined
      }),
    )
  },
})
