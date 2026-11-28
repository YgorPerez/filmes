// Programa: a name of `presets.toml` ("Encontro", "noite com as crianças")
// is its Climas and Restrições, the same as its chip on Nova Sessão (#402).
// A longer name wins over the words in it: "noite com as crianças" is the
// Programa, not only the child.

import { Effect } from 'effect'
import { readPresets } from '../../recommendation/presets.ts'
import { longestOf, scan, type Reader } from '../reader.ts'
import { phraseOf, type Phrase } from '../words.ts'

/** How a Programa reads on the page. */
export const presetLabel = (name: string) => `Programa: ${name}`

export const presetReader: Reader = {
  field: 'preset',
  open: false,
  read: (words) =>
    Effect.gen(function* () {
      const table = (yield* readPresets).map(
        (preset) =>
          [phraseOf(preset.name), preset] as readonly [Phrase, typeof preset],
      )
      return scan(words, (i) => {
        const best = longestOf(words, i, table)
        return (
          best && {
            start: i,
            end: i + best.length,
            found: {
              request: best.value.fields,
              label: presetLabel(best.value.name),
            },
          }
        )
      })
    }),
}
