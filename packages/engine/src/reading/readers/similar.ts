// Parecido: "parecido com Amélie", "tipo Amélie", "entre Amélie e Her". A
// title ends with its clause, at the next word another item took, or at
// the next "parecido com"; the Catálogo search, on films only, resolves
// it. Only one clear film is taken: the one whose whole title it is, or
// the search's only one. Anything else is ambiguous, with the films found.

import { Effect, Schema } from 'effect'
import {
  searchCatalog,
  SEARCH_MIN_LENGTH,
  type FilmMatch,
} from '../../catalog/search.ts'
import { searchKey } from '../../catalog/search-key.ts'
import { similarModule } from '../../recommendation/constraints/similar.ts'
import type { EngineError } from '../../runtime/EngineError.ts'
import type { Sqlite, SqliteError } from '../../sqlite/Sqlite.ts'
import {
  makeReader,
  type Claim,
  type Found,
  type ReadEffect,
} from '../reader.ts'
import { phrasesOf, type Phrase, type Words } from '../words.ts'

interface Search {
  readonly start: number
  readonly films: ReadonlyArray<FilmMatch>
  readonly clear: FilmMatch | undefined
}

interface Split {
  readonly left: Search
  readonly right: Search
  /** Where the "e" is, and where the second title starts. */
  readonly and: number
  readonly rightStart: number
}

const search = (words: Words, start: number, end: number) =>
  Effect.gen(function* () {
    const query = words.text(start, end)
    const films =
      searchKey(query).length < SEARCH_MIN_LENGTH
        ? []
        : (yield* searchCatalog({ query, kinds: ['film'] })).films
    const whole = films.filter((f) => searchKey(f.title) === searchKey(query))
    const [only] = whole.length > 0 ? whole : films
    const clear = whole.length === 1 || films.length === 1 ? only : undefined
    return { start, films, clear } satisfies Search
  })

/** The title from `start` to before `end`, and without the words that
 * only join the others at its start ("ao Poeira") when that makes it
 * clear. Else the first search with any film says what is ambiguous. */
const title = (
  words: Words,
  start: number,
  end: number,
  fillers: ReadonlySet<string>,
): Effect.Effect<Search, EngineError | SqliteError, Sqlite> =>
  Effect.gen(function* () {
    const here = yield* search(words, start, end)
    if (here.clear || start + 1 >= end || !fillers.has(words.key(start)))
      return here
    const rest = yield* title(words, start + 1, end, fillers)
    return rest.clear || here.films.length === 0 ? rest : here
  })

const found = ({ films, clear }: Search): Found =>
  clear
    ? {
        request: { similar: [clear.id] },
        label: similarModule.label({
          name: 'similar',
          films: [clear.id],
          titles: [clear.title],
        }),
      }
    : {
        candidates: films.map((f) => ({
          id: f.id,
          label: f.year === null ? f.title : `${f.title} (${f.year})`,
        })),
      }

/** Where the title from `start` ends, without the words that only join
 * the others at its end. */
const titleEnd = (
  words: Words,
  triggers: ReadonlyArray<Phrase>,
  fillers: ReadonlySet<string>,
  start: number,
) => {
  let end = start
  while (
    words.span(start, end + 1) &&
    (end === start || words.longest(end, triggers) === 0)
  )
    end += 1
  while (end > start && fillers.has(words.key(end - 1))) end -= 1
  return end
}

/** "entre X e Y" from `i`, the titles from `start` to before `end`: the
 * first "e" where both titles are clear, or else the first "e". */
const betweenClaims = (
  words: Words,
  and: ReadonlyArray<Phrase>,
  fillers: ReadonlySet<string>,
  span: { readonly i: number; readonly start: number; readonly end: number },
): Effect.Effect<ReadonlyArray<Claim>, EngineError | SqliteError, Sqlite> =>
  Effect.gen(function* () {
    const { i, start, end } = span
    const splits: Split[] = []
    for (let at = start + 1; at < end - 1; at += 1) {
      const gap = words.longest(at, and)
      if (gap === 0) continue
      splits.push({
        left: yield* title(words, start, at, fillers),
        right: yield* title(words, at + gap, end, fillers),
        and: at,
        rightStart: at + gap,
      })
      if (splits.at(-1)?.left.clear && splits.at(-1)?.right.clear) break
    }
    const chosen =
      splits.find((s) => s.left.clear && s.right.clear) ?? splits[0]
    if (!chosen) return []
    const { left, right, rightStart } = chosen
    return [
      {
        start: i,
        end: rightStart,
        quote: { start: left.start, end: chosen.and },
        found: found(left),
      },
      {
        start: rightStart,
        end,
        quote: { start: right.start, end },
        found: found(right),
      },
    ]
  })

export const similarReader = makeReader({
  field: 'similar',
  section: 'similar',
  open: true,
  vocabulary: Schema.Struct({
    phrases: Schema.Array(Schema.String),
    between: Schema.Array(Schema.String),
    and: Schema.Array(Schema.String),
  }),
  read: (words, vocabulary, context): ReadEffect =>
    Effect.gen(function* () {
      const like = phrasesOf(vocabulary.phrases)
      const between = phrasesOf(vocabulary.between)
      const and = phrasesOf(vocabulary.and)
      const triggers: Phrase[] = [...like, ...between]

      const claims: Claim[] = []
      for (let i = 0; i < words.length; i += 1) {
        // The words of "entre" (two titles) or of "parecido com" (one).
        const betweenLength = words.longest(i, between)
        const likeLength = betweenLength > 0 ? 0 : words.longest(i, like)
        const start = i + betweenLength + likeLength
        const end =
          start > i ? titleEnd(words, triggers, context.fillers, start) : start
        if (end === start) continue
        if (likeLength > 0) {
          const read = yield* title(words, start, end, context.fillers)
          claims.push({
            start: i,
            end,
            quote: { start: read.start, end },
            found: found(read),
          })
          continue
        }
        claims.push(
          ...(yield* betweenClaims(words, and, context.fillers, {
            i,
            start,
            end,
          })),
        )
      }
      return claims
    }),
})
