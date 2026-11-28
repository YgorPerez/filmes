// Nada de um Clima: a negation and then a Clima in its clause ("nada de
// terror", "sem comédia", "não quero nada tenso"), with only words that
// join the others between them, is the Restrição no_mood of that Clima
// (#272). The item takes the negation, the words between and the Clima.
// "nada triste" and "nada de chorar" stay the Restrição no_sad: those
// phrases are as long, and that reader comes first. A Clima of popularity
// turned away is its opposite, which `moods.ts` reads (#387).

import { Effect } from 'effect'
import { noMoodLabel } from '../../recommendation/constraints/no-mood.ts'
import { makeReader, scan } from '../reader.ts'
import {
  MoodSynonyms,
  moodTable,
  negatedMood,
  popularityOpposites,
} from './moods.ts'

export const noMoodsReader = makeReader({
  field: 'noMoods',
  section: 'moods',
  vocabulary: MoodSynonyms,
  read: (words, synonyms, context) =>
    Effect.gen(function* () {
      const table = yield* moodTable(synonyms)
      const opposites = yield* popularityOpposites
      return scan(words, (i) => {
        const negated = negatedMood(words, i, table, context)
        if (negated === undefined || opposites.has(negated.mood))
          return undefined
        return {
          start: i,
          end: negated.end,
          found: {
            request: { noMoods: [negated.mood] },
            label: noMoodLabel([negated.mood]),
          },
        }
      })
    }),
})
