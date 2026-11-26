// Leitura do pedido [request reading] (#184): a sentence the Dono types on
// the web, read into the fields of a recommendation request with no
// language model, by the readers of `readers/` and the vocabulary of
// `config/request_reading.toml`. It reads the Pessoas and the Catálogo and
// writes nothing.
//
// Each reader claims words; when claims overlap, the one with more words
// wins (a tie goes to the first word, then to the first reader), and a
// word is used by one item at most. The open readers (a title, which ends
// anywhere) read after the others, on the words left. A clause with a
// word of taste ("odeia") is not read: taste is never read from text.

import { Effect, Schema } from 'effect'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { ownerOf } from '../runtime/Owner.ts'
import { text } from '../sqlite/row.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import type {
  Claim,
  PersonName,
  ReadCandidate,
  ReadField,
  ReadingContext,
  ReadRequest,
} from './reader.ts'
import { READERS } from './readers/index.ts'
import { phraseOf, phrasesOf, sentenceOf, wordsOf } from './words.ts'

/** The longest sentence read, in characters. */
export const REQUEST_READING_MAX_LENGTH = 500

export interface RequestReadingRequest {
  readonly text: string
}

/** One thing understood, with the words it came from as typed. */
export interface ReadItem {
  readonly field: ReadField
  readonly words: string
  /** How it reads on the page ("Presente: Iara", "nada lento"). */
  readonly label: string
  /** Its part of the request. */
  readonly request: ReadRequest
}

/** A name of several Pessoas, or a title of several films or of none. */
export interface ReadAmbiguity {
  readonly field: ReadField
  readonly words: string
  readonly candidates: ReadonlyArray<ReadCandidate>
}

export interface RequestReading {
  readonly text: string
  /** Every item's part, merged: the lists joined in order, each value
   * once; another field, the last item's. */
  readonly request: ReadRequest
  /** In the order of the sentence. */
  readonly understood: ReadonlyArray<ReadItem>
  /** Each run of words no item took, as typed, without the words that
   * only join the others at its ends. */
  readonly notUnderstood: ReadonlyArray<string>
  readonly ambiguities: ReadonlyArray<ReadAmbiguity>
}

const Common = Schema.Struct({
  fillers: Schema.Array(Schema.String),
  numbers: Schema.Record(Schema.String, Schema.Int),
  taste: Schema.Struct({ words: Schema.Array(Schema.String) }),
})

const LISTS = ['attendees', 'moods', 'similar'] as const

const merge = (into: ReadRequest, part: ReadRequest): ReadRequest => {
  const merged: { -readonly [K in keyof ReadRequest]: ReadRequest[K] } = {
    ...into,
    ...part,
  }
  for (const key of LISTS) {
    const before = into[key]
    const added = part[key]
    if (before && added) merged[key] = [...new Set([...before, ...added])]
  }
  return merged
}

/** The Pessoas by each key they answer to, and the Dono. */
const peopleOf = (
  db: Connection,
): Effect.Effect<
  Pick<ReadingContext, 'people' | 'longestName' | 'owner'>,
  SqliteError
> =>
  Effect.gen(function* () {
    const names = new Map<string, string>()
    const keys: Array<readonly [string, string]> = []
    for (const row of yield* db.all('SELECT slug, nome FROM pessoas')) {
      names.set(text(row, 'slug'), text(row, 'nome'))
      keys.push([text(row, 'slug'), text(row, 'slug')])
      keys.push([text(row, 'nome'), text(row, 'slug')])
    }
    for (const row of yield* db.all('SELECT pessoa, apelido FROM apelidos'))
      keys.push([text(row, 'apelido'), text(row, 'pessoa')])
    const slugs = new Map<string, Set<string>>()
    for (const [name, slug] of keys) {
      const key = phraseOf(name).join(' ')
      if (key !== '') slugs.set(key, (slugs.get(key) ?? new Set()).add(slug))
    }
    const person = (slug: string): PersonName => ({
      slug,
      name: names.get(slug) ?? slug,
    })
    const people = new Map(
      [...slugs].map(([key, set]) => [key, [...set].sort().map(person)]),
    )
    const owner = yield* ownerOf(db)
    return {
      people,
      longestName: Math.max(
        0,
        ...[...people.keys()].map((k) => k.split(' ').length),
      ),
      owner: owner === null ? null : person(owner),
    }
  })

interface Chosen extends Claim {
  readonly field: ReadField
  /** The reader's place in `READERS`, for a tie. */
  readonly order: number
}

/** The claims that do not overlap, the longest first, into `used`. */
const choose = (
  claims: ReadonlyArray<Chosen>,
  used: Map<number, Chosen>,
): void => {
  const sorted = [...claims].sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start ||
      a.order - b.order,
  )
  for (const claim of sorted) {
    const at = Array.from(
      { length: claim.end - claim.start },
      (_, n) => claim.start + n,
    )
    if (at.some((i) => used.has(i))) continue
    for (const i of at) used.set(i, claim)
  }
}

/** Reads `request.text` into the request fields it understood. A
 * sentence over `REQUEST_READING_MAX_LENGTH` is `invalid_usage`. */
export const readRequest = (
  request: RequestReadingRequest,
): Effect.Effect<
  RequestReading,
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
    if (request.text.length > REQUEST_READING_MAX_LENGTH)
      return yield* engineError(
        'invalid_usage',
        `a frase tem mais de ${REQUEST_READING_MAX_LENGTH} caracteres`,
      )
    const file = yield* (yield* Environment).readConfig(
      'request_reading',
      Schema.Record(Schema.String, Schema.Unknown),
    )
    const common = yield* Schema.decodeUnknownEffect(Common)(file).pipe(
      Effect.mapError((error) =>
        engineError('invalid_config', `request_reading.toml: ${error.message}`),
      ),
    )
    const sqlite = yield* Sqlite
    const context: ReadingContext = {
      ...(yield* sqlite.read(peopleOf)),
      fillers: new Set(phrasesOf(common.fillers).map((p) => p.join(' '))),
    }
    const numbers = new Map(
      Object.entries(common.numbers).map(([name, n]) => [
        phraseOf(name).join(' '),
        n,
      ]),
    )
    const sentence = sentenceOf(request.text)
    const { tokens } = sentence

    const taste = phrasesOf(common.taste.words)
    const all = wordsOf(sentence, numbers, () => false)
    const tasteClauses = new Set(
      tokens.flatMap((token, i) =>
        all.longest(i, taste) > 0 ? [token.clause] : [],
      ),
    )
    const blocked = (i: number) => tasteClauses.has(tokens[i]?.clause ?? -1)

    const used = new Map<number, Chosen>()
    const phase = (open: boolean) =>
      Effect.gen(function* () {
        const words = wordsOf(
          sentence,
          numbers,
          (i) => blocked(i) || used.has(i),
        )
        const claims: Chosen[] = []
        for (const [order, reader] of READERS.entries()) {
          if (reader.open !== open) continue
          for (const claim of yield* reader.read(words, file, context))
            claims.push({ ...claim, field: reader.field, order })
        }
        choose(claims, used)
      })
    yield* phase(false)
    yield* phase(true)

    const chosen = [...new Set(used.values())].sort((a, b) => a.start - b.start)
    const quoted = ({ quote, start, end }: Claim) =>
      all.text(quote?.start ?? start, quote?.end ?? end)
    const understood: ReadItem[] = []
    const ambiguities: ReadAmbiguity[] = []
    for (const claim of chosen) {
      const words = quoted(claim)
      if ('candidates' in claim.found)
        ambiguities.push({
          field: claim.field,
          words,
          candidates: claim.found.candidates,
        })
      else
        understood.push({
          field: claim.field,
          words,
          label: claim.found.label,
          request: claim.found.request,
        })
    }

    const notUnderstood: string[] = []
    let run: { start: number; end: number } | undefined
    const flush = () => {
      if (run) notUnderstood.push(all.text(run.start, run.end))
      run = undefined
    }
    for (const [i, token] of tokens.entries()) {
      if (used.has(i) || (run && tokens[run.start]?.clause !== token.clause))
        flush()
      if (used.has(i) || context.fillers.has(token.key)) continue
      run = { start: run?.start ?? i, end: i + 1 }
    }
    flush()

    return {
      text: request.text,
      request: understood.reduce<ReadRequest>(
        (merged, item) => merge(merged, item.request),
        {},
      ),
      understood,
      notUnderstood,
      ambiguities,
    }
  })
