// The fixed vocabulary of Climas [moods], in `moods.toml`
// (`recomendacao/climas.py`). A Clima is asked for by name, with no
// difference of case or accent ("Ação", "acao"). A name outside the
// vocabulary is not an error: it comes back as a warning and the
// recommendation goes on without it, because a Clima only pulls the order.

import { Effect, Schema } from 'effect'
import { casefold, pyStrip } from '../compat/text.ts'
import { PY_WHITESPACE_CLASS } from '../compat/whitespace.ts'
import { Environment } from '../runtime/Environment.ts'
import type { EngineError } from '../runtime/EngineError.ts'

export interface Mood {
  readonly name: string
  /** MovieLens tags, in lowercase as the tables store them. */
  readonly tags: ReadonlyArray<string>
  /** Wikidata genre QIDs, as the `genero` edges. */
  readonly genres: ReadonlyArray<string>
  /** A Clima of the film's popularity (#387): it pulls by the IMDb votes,
   * up for `known`, down for `unknown`, and has no tags or genres. */
  readonly popularity: Popularity | null
}

const Popularity = Schema.Literals(['known', 'unknown'])
export type Popularity = typeof Popularity.Type

const MoodsToml = Schema.Record(
  Schema.String,
  Schema.Struct({
    tags: Schema.optionalKey(Schema.Array(Schema.String)),
    genres: Schema.optionalKey(Schema.Array(Schema.String)),
    popularity: Schema.optionalKey(Popularity),
  }),
)

/** Every Clima, in the file's order. */
export const readMoods: Effect.Effect<
  ReadonlyArray<Mood>,
  EngineError,
  Environment
> = Effect.gen(function* () {
  const table = yield* (yield* Environment).readConfig('moods', MoodsToml)
  return Object.entries(table).map(([name, mood]) => ({
    name,
    tags: (mood.tags ?? []).map((tag) => tag.toLowerCase()),
    genres: mood.genres ?? [],
    popularity: mood.popularity ?? null,
  }))
})

/** Whether a code point has a nonzero canonical combining class (Python's
 * `unicodedata.combining`). JavaScript does not expose the class, but NFD's
 * canonical reordering does: a mark with class above 1 moves after a
 * following class-1 mark (U+0334), and one below 240 moves before a
 * preceding class-240 mark (U+0345). A starter (class 0) moves in neither.
 * Only for a code point NFD leaves alone, as NFKD's output is; checked
 * against Python 3.12 on every such code point (the 46 that differ are
 * newer than its Unicode 15.0). */
const isCombining = (char: string): boolean =>
  `a${char}\u{334}`.normalize('NFD') !== `a${char}\u{334}` ||
  `a\u{345}${char}`.normalize('NFD') !== `a\u{345}${char}`

const PY_WHITESPACE = new RegExp(`${PY_WHITESPACE_CLASS}+`, 'u')

/** The name as the vocabulary is matched: casefolded, without accents, with
 * hyphens as spaces and one space between words. */
const moodKey = (name: string): string =>
  pyStrip(
    Array.from(casefold(name).normalize('NFKD'))
      .filter((char) => !isCombining(char))
      .join('')
      .replaceAll('-', ' '),
  )
    .split(PY_WHITESPACE)
    .filter((word) => word !== '')
    .join(' ')

/** The Climas asked for, each once in the order asked, and a warning for
 * each name outside the vocabulary. */
export const resolveMoods = (
  asked: ReadonlyArray<string>,
): Effect.Effect<
  { readonly moods: ReadonlyArray<Mood>; readonly warnings: string[] },
  EngineError,
  Environment
> =>
  Effect.gen(function* () {
    const vocabulary = new Map<string, Mood>()
    for (const mood of yield* readMoods)
      vocabulary.set(moodKey(mood.name), mood)
    const moods: Mood[] = []
    const warnings: string[] = []
    for (const name of asked) {
      const mood = vocabulary.get(moodKey(name))
      if (mood === undefined) {
        const names = [...vocabulary.values()].map((m) => m.name).join(', ')
        warnings.push(
          `o Clima '${pyStrip(name)}' não está no vocabulário e ficou de fora. Os Climas são ${names}.`,
        )
      } else if (!moods.includes(mood)) {
        moods.push(mood)
      }
    }
    return { moods, warnings }
  })
