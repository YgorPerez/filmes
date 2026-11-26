// Ano: "dos anos 90", "depois de 2010", "a partir de 2010", "antes de
// 1980", "até 2015", "entre 1990 e 2000". "Depois" and "antes" leave the
// year out: "depois de 2010" is from 2011.

import { Effect, Schema } from 'effect'
import { makeReader, restrictionLabel, scan, type Claim } from '../reader.ts'
import { phrasesOf, type Words } from '../words.ts'

const Vocabulary = Schema.Struct({
  decade: Schema.Array(Schema.String),
  after: Schema.Array(Schema.String),
  since: Schema.Array(Schema.String),
  before: Schema.Array(Schema.String),
  until: Schema.Array(Schema.String),
  between: Schema.Array(Schema.String),
  and: Schema.Array(Schema.String),
})

const YEAR = /^\d{4}$/u
const DECADE = /^(?:\d0|\d{3}0)$/u

const yearAt = (words: Words, i: number): number | undefined =>
  words.free(i) && YEAR.test(words.key(i)) ? Number(words.key(i)) : undefined

/** "90" is 1990, "00" and "10" are 2000 and 2010, "1970" is 1970. */
const decadeAt = (words: Words, i: number): number | undefined => {
  const key = words.key(i)
  if (!words.free(i) || !DECADE.test(key)) return undefined
  const n = Number(key)
  if (key.length === 4) return n
  return n <= 10 ? 2000 + n : 1900 + n
}

const claim = (
  start: number,
  end: number,
  since: number | null,
  until: number | null,
): Claim => ({
  start,
  end,
  found: {
    request: {
      ...(since === null ? {} : { since }),
      ...(until === null ? {} : { until }),
    },
    label: restrictionLabel({ name: 'year', since, until }),
  },
})

export const yearReader = makeReader({
  field: 'year',
  section: 'year',
  vocabulary: Vocabulary,
  read: (words, vocabulary) => {
    const phrases = {
      decade: phrasesOf(vocabulary.decade),
      after: phrasesOf(vocabulary.after),
      since: phrasesOf(vocabulary.since),
      before: phrasesOf(vocabulary.before),
      until: phrasesOf(vocabulary.until),
      between: phrasesOf(vocabulary.between),
      and: phrasesOf(vocabulary.and),
    }
    /** The phrase of `kind` at `i` and the year after it. */
    const then = (
      i: number,
      kind: keyof typeof phrases,
      read: (words: Words, i: number) => number | undefined = yearAt,
    ) => {
      const length = words.longest(i, phrases[kind])
      const value = length > 0 ? read(words, i + length) : undefined
      return value === undefined || !words.span(i, i + length + 1)
        ? undefined
        : { value, end: i + length + 1 }
    }
    return Effect.succeed(
      scan(words, (i) => {
        const decade = then(i, 'decade', decadeAt)
        if (decade) return claim(i, decade.end, decade.value, decade.value + 9)
        const between = then(i, 'between')
        const last = between && then(between.end, 'and')
        if (between && last)
          return claim(
            i,
            last.end,
            Math.min(between.value, last.value),
            Math.max(between.value, last.value),
          )
        const after = then(i, 'after')
        if (after) return claim(i, after.end, after.value + 1, null)
        const since = then(i, 'since')
        if (since) return claim(i, since.end, since.value, null)
        const before = then(i, 'before')
        if (before) return claim(i, before.end, null, before.value - 1)
        const until = then(i, 'until')
        return until && claim(i, until.end, null, until.value)
      }),
    )
  },
})
