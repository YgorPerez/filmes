// Duração máxima: "até 2h", "no máximo 90 minutos", "uma hora e meia",
// "curto". "2h", "1h30" and "90min" are one word each.

import { Effect, Schema } from 'effect'
import { makeReader, restrictionLabel, scan, type Claim } from '../reader.ts'
import { phrasesOf, type Words } from '../words.ts'

const Vocabulary = Schema.Struct({
  before: Schema.Array(Schema.String),
  hours: Schema.Array(Schema.String),
  minutes: Schema.Array(Schema.String),
  half: Schema.Array(Schema.String),
  short: Schema.Array(Schema.String),
  short_minutes: Schema.Int,
})

/** "2h", "2h30", "1h30min". */
const HOURS_WORD = /^(\d+)h(\d*)(?:min)?$/u
/** "90min". */
const MINUTES_WORD = /^(\d+)min$/u

const claim = (start: number, end: number, minutes: number): Claim => ({
  start,
  end,
  found: {
    request: { maxDuration: minutes },
    label: restrictionLabel({ name: 'duration', max_minutes: minutes }),
  },
})

export const durationReader = makeReader({
  field: 'maxDuration',
  section: 'duration',
  vocabulary: Vocabulary,
  read: (words, vocabulary) => {
    const before = phrasesOf(vocabulary.before)
    const hours = phrasesOf(vocabulary.hours)
    const minutes = phrasesOf(vocabulary.minutes)
    const half = phrasesOf(vocabulary.half)
    const short = phrasesOf(vocabulary.short)

    /** The time at `i`: its minutes and the word after it. */
    const time = (
      w: Words,
      i: number,
    ): { readonly minutes: number; readonly end: number } | undefined => {
      const word = w.key(i)
      const inHours = HOURS_WORD.exec(word)
      const inMinutes = MINUTES_WORD.exec(word)
      const n = w.number(i)
      let found: { minutes: number; end: number; hours: boolean } | undefined
      if (inHours)
        found = {
          minutes: Number(inHours[1]) * 60 + Number(inHours[2] || 0),
          end: i + 1,
          hours: inHours[2] === '',
        }
      else if (inMinutes)
        found = { minutes: Number(inMinutes[1]), end: i + 1, hours: false }
      else if (n !== undefined) {
        const h = w.longest(i + 1, hours)
        const m = h > 0 ? 0 : w.longest(i + 1, minutes)
        if (h > 0) found = { minutes: n * 60, end: i + 1 + h, hours: true }
        else if (m > 0) found = { minutes: n, end: i + 1 + m, hours: false }
      }
      if (found === undefined || !w.span(i, found.end)) return undefined
      const halfHour = found.hours ? w.longest(found.end, half) : 0
      return {
        minutes: found.minutes + (halfHour > 0 ? 30 : 0),
        end: found.end + halfHour,
      }
    }

    return Effect.succeed(
      scan(words, (i) => {
        const shortLength = words.longest(i, short)
        if (shortLength > 0)
          return claim(i, i + shortLength, vocabulary.short_minutes)
        const prefix = words.longest(i, before)
        const found = time(words, i + prefix)
        return found && found.minutes > 0 && words.span(i, found.end)
          ? claim(i, found.end, found.minutes)
          : undefined
      }),
    )
  },
})
