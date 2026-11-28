// What a reader of the Leitura do pedido is: one kind of field, its section
// of `request_reading.toml`, and the words it claims in a sentence. A new
// kind is a new file in `readers/`, listed in `readers/index.ts`.

import { Effect, Schema } from 'effect'
import type { RecommendRequest } from '../recommendation/recommend.ts'
import type { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Sqlite, SqliteError } from '../sqlite/Sqlite.ts'
import { phrasesOf, type Phrase, type Words } from './words.ts'

/** The kinds of field a sentence is read into, one reader each. */
export type ReadField =
  | 'attendees'
  | 'moods'
  | 'maxDuration'
  | 'child'
  | 'year'
  | 'language'
  | 'unseen'
  | 'noSlow'
  | 'noSad'
  | 'noMoods'
  | 'similar'
  | 'count'
  | 'by'
  | 'preset'

/** The fields of a recommendation request a sentence can fill, with the
 * same names and values: what one item read, or a whole reading. */
export type ReadFields = Partial<
  Pick<
    RecommendRequest,
    | 'attendees'
    | 'moods'
    | 'count'
    | 'rule'
    | 'by'
    | 'maxDuration'
    | 'child'
    | 'since'
    | 'until'
    | 'language'
    | 'unseen'
    | 'noSlow'
    | 'noSad'
    | 'noMoods'
    | 'similar'
  >
>

/** One of the Pessoas or films a name or title may be: the id that goes in
 * the request, and how it reads. */
export interface ReadCandidate {
  readonly id: string
  readonly label: string
}

/** What a reader found in some words: an item of the request, or a name
 * or title that is more than one thing (or, for a title, nothing). */
export type Found =
  | { readonly request: ReadFields; readonly label: string }
  | { readonly candidates: ReadonlyArray<ReadCandidate> }

export interface Claim {
  /** The words it takes, from `start` to before `end`. */
  readonly start: number
  readonly end: number
  /** The words it quotes, when fewer than it takes (a title without
   * "parecido com"). */
  readonly quote?: { readonly start: number; readonly end: number }
  readonly found: Found
}

export interface PersonName {
  readonly slug: string
  readonly name: string
}

/** What every reader may use, read once per sentence. */
export interface ReadingContext {
  /** The Pessoas by the key of a slug, a name or a nickname (its words'
   * keys with one space), each list in slug order. */
  readonly people: ReadonlyMap<string, ReadonlyArray<PersonName>>
  /** The most words a name in `people` has. */
  readonly longestName: number
  /** The logged-in Dono, or `null` when there is none. */
  readonly owner: PersonName | null
  /** The keys of the words that only join the others. */
  readonly fillers: ReadonlySet<string>
  /** The phrases that deny what follows them in their clause ("nada de",
   * "sem", "não"). */
  readonly negations: ReadonlyArray<Phrase>
}

export type ReadEffect = Effect.Effect<
  ReadonlyArray<Claim>,
  EngineError | SqliteError,
  Sqlite | Environment
>

export interface Reader {
  readonly field: ReadField
  /** An open reader (a title, which ends anywhere) runs after the others,
   * on the words they left. */
  readonly open: boolean
  /** The claims in `words`, given the whole vocabulary file. */
  readonly read: (
    words: Words,
    file: Readonly<Record<string, unknown>>,
    context: ReadingContext,
  ) => ReadEffect
}

/** A reader whose section of the vocabulary is decoded by `vocabulary`; a
 * section that does not fit is `invalid_config`. */
export const makeReader = <
  S extends Schema.ConstraintDecoder<unknown>,
>(reader: {
  readonly field: ReadField
  readonly section: string
  readonly vocabulary: S
  readonly open?: boolean
  readonly read: (
    words: Words,
    vocabulary: S['Type'],
    context: ReadingContext,
  ) => ReadEffect
}): Reader => ({
  field: reader.field,
  open: reader.open ?? false,
  read: (words, file, context) =>
    Schema.decodeUnknownEffect(reader.vocabulary)(file[reader.section]).pipe(
      Effect.mapError((error) =>
        engineError(
          'invalid_config',
          `request_reading.toml [${reader.section}]: ${error.message}`,
        ),
      ),
      Effect.flatMap((vocabulary) => reader.read(words, vocabulary, context)),
    ),
})

/** The claim `at` makes at each free word. */
export const scan = (
  words: Words,
  at: (i: number) => Claim | undefined,
): ReadonlyArray<Claim> => {
  const claims: Claim[] = []
  for (let i = 0; i < words.length; i += 1) {
    const claim = words.free(i) ? at(i) : undefined
    if (claim) claims.push(claim)
  }
  return claims
}

/** The value of the longest phrase of `table` at `i`, and its length; the
 * first in the table wins a tie. */
export const longestOf = <V>(
  words: Words,
  i: number,
  table: ReadonlyArray<readonly [Phrase, V]>,
): { readonly length: number; readonly value: V } | undefined => {
  let best: { readonly length: number; readonly value: V } | undefined
  for (const [phrase, value] of table) {
    const length = words.longest(i, [phrase])
    if (length > (best?.length ?? 0)) best = { length, value }
  }
  return best
}

/** A section that is only a list of phrases. */
export const Phrases = Schema.Struct({ phrases: Schema.Array(Schema.String) })

/** A reader of a yes-or-no Restrição: any of its phrases asks for it. */
export const flagReader = (
  field: ReadField,
  section: string,
  request: ReadFields,
  label: string,
): Reader =>
  makeReader({
    field,
    section,
    vocabulary: Phrases,
    read: (words, { phrases }) => {
      const table = phrasesOf(phrases)
      return Effect.succeed(
        scan(words, (i) => {
          const length = words.longest(i, table)
          return length > 0
            ? { start: i, end: i + length, found: { request, label } }
            : undefined
        }),
      )
    },
  })
