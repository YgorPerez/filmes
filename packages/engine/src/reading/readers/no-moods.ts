// Nada de um Clima: a negation and then a Clima in its clause ("nada de
// terror", "sem comédia", "não quero nada tenso"), with only words that
// join the others between them, is the Restrição no_mood of that Clima
// (#272). The item takes the negation, the words between and the Clima.
// "nada triste" and "nada de chorar" stay the Restrição no_sad: those
// phrases are as long, and that reader comes first.

import { Effect } from 'effect'
import { noMoodLabel } from '../../recommendation/constraints/no-mood.ts'
import { longestOf, makeReader, scan } from '../reader.ts'
import { MoodSynonyms, moodTable } from './moods.ts'

export const noMoodsReader = makeReader({
  field: 'noMoods',
  section: 'moods',
  vocabulary: MoodSynonyms,
  read: (words, synonyms, context) =>
    Effect.gen(function* () {
      const table = yield* moodTable(synonyms)
      return scan(words, (i) => {
        const negation = words.longest(i, context.negations)
        if (negation === 0) return undefined
        let at = i + negation
        while (
          words.clause(at) === words.clause(i) &&
          context.fillers.has(words.key(at)) &&
          longestOf(words, at, table) === undefined
        )
          at += 1
        if (words.clause(at) !== words.clause(i)) return undefined
        const best = longestOf(words, at, table)
        if (best === undefined || !words.span(i, at + best.length))
          return undefined
        return {
          start: i,
          end: at + best.length,
          found: {
            request: { noMoods: [best.value] },
            label: noMoodLabel([best.value]),
          },
        }
      })
    }),
})
