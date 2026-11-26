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
import { REQUEST_READING_MAX_LENGTH } from './limits.ts'
import type {
  Claim,
  PersonName,
  ReadCandidate,
  ReadField,
  ReadFields,
  ReadingContext,
} from './reader.ts'
import { READERS } from './readers/index.ts'
import {
  phraseOf,
  phrasesOf,
  sentenceOf,
  wordsOf,
  type Phrase,
  type Sentence,
  type Words,
} from './words.ts'

export { REQUEST_READING_MAX_LENGTH }

export interface RequestReadingInput {
  readonly text: string
  /** The kinds of field to apply; the words of an item of any other kind
   * come back not understood. All of them when absent. */
  readonly fields?: ReadonlyArray<ReadField>
}

/** One thing understood, with the words it came from as typed. */
export interface ReadItem {
  readonly field: ReadField
  readonly words: string
  /** How it reads on the page ("Presente: Iara", "nada lento"). */
  readonly label: string
  /** Its part of the request. */
  readonly request: ReadFields
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
  readonly request: ReadFields
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
  negation: Schema.Struct({ words: Schema.Array(Schema.String) }),
  taste: Schema.Struct({ words: Schema.Array(Schema.String) }),
})

const LISTS = ['attendees', 'moods', 'similar'] as const

/** `part` over `into`: a list joined to the one there, in order and each
 * value once; any other field, `part`'s when it has one. How a reading's
 * items make its request, and how the web puts a reading on a request. */
export const mergeReadFields = <R extends ReadFields>(
  into: R,
  part: ReadFields,
): R => {
  const lists: { [K in (typeof LISTS)[number]]?: ReadonlyArray<string> } = {}
  for (const key of LISTS) {
    const before = into[key]
    const added = part[key]
    if (before && added) lists[key] = [...new Set([...before, ...added])]
  }
  return { ...into, ...part, ...lists }
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

/** What the readers read the sentence with. */
interface Reading {
  readonly sentence: Sentence
  readonly numbers: ReadonlyMap<string, number>
  readonly file: Readonly<Record<string, unknown>>
  readonly context: ReadingContext
  /** Whether the word at `i` is in a clause about taste. */
  readonly blocked: (i: number) => boolean
}

/** The vocabulary file, its common part decoded, and the reading context. */
const prepareReading = (
  request: RequestReadingInput,
): Effect.Effect<
  Omit<Reading, 'blocked'> & { readonly taste: ReadonlyArray<Phrase> },
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
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
      negations: phrasesOf(common.negation.words),
    }
    const numbers = new Map(
      Object.entries(common.numbers).map(([name, n]) => [
        phraseOf(name).join(' '),
        n,
      ]),
    )
    return {
      sentence: sentenceOf(request.text),
      numbers,
      file,
      context,
      taste: phrasesOf(common.taste.words),
    }
  })

/** Word → the claim that took it: the closed readers first, then the open
 * ones on the words left. */
const claimWords = (reading: Reading) =>
  Effect.gen(function* () {
    const used = new Map<number, Chosen>()
    const phase = (open: boolean) =>
      Effect.gen(function* () {
        const words = wordsOf(
          reading.sentence,
          reading.numbers,
          (i) => reading.blocked(i) || used.has(i),
        )
        const claims: Chosen[] = []
        for (const [order, reader] of READERS.entries()) {
          if (reader.open !== open) continue
          for (const claim of yield* reader.read(
            words,
            reading.file,
            reading.context,
          ))
            claims.push({ ...claim, field: reader.field, order })
        }
        choose(claims, used)
      })
    yield* phase(false)
    yield* phase(true)
    return used
  })

/** The items of the fields applied, in the order of the sentence. */
const itemsOf = (
  used: ReadonlyMap<number, Chosen>,
  applied: ReadonlySet<ReadField>,
  all: Words,
) => {
  const chosen = [...new Set(used.values())].sort((a, b) => a.start - b.start)
  const quoted = ({ quote, start, end }: Claim) =>
    all.text(quote?.start ?? start, quote?.end ?? end)
  const understood: ReadItem[] = []
  const ambiguities: ReadAmbiguity[] = []
  for (const claim of chosen) {
    if (!applied.has(claim.field)) continue
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
  return { understood, ambiguities }
}

/** Each run of words no item took, and each item of a field not applied. */
const notUnderstoodOf = (
  reading: Reading,
  used: ReadonlyMap<number, Chosen>,
  applied: ReadonlySet<ReadField>,
  all: Words,
): string[] => {
  const { tokens } = reading.sentence
  const notUnderstood: string[] = []
  let run: { start: number; end: number } | undefined
  const flush = () => {
    if (run) notUnderstood.push(all.text(run.start, run.end))
    run = undefined
  }
  for (const [i, token] of tokens.entries()) {
    const claim = used.get(i)
    if (claim || (run && tokens[run.start]?.clause !== token.clause)) flush()
    // An item of a field not applied comes back whole, as typed.
    if (claim && !applied.has(claim.field) && claim.start === i)
      notUnderstood.push(all.text(claim.start, claim.end))
    if (claim || reading.context.fillers.has(token.key)) continue
    run = { start: run?.start ?? i, end: i + 1 }
  }
  flush()
  return notUnderstood
}

/** Reads `request.text` into the request fields it understood, applying
 * only the items of `request.fields`. A sentence over
 * `REQUEST_READING_MAX_LENGTH` is `invalid_usage`. */
export const readRequest = (
  request: RequestReadingInput,
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
    const { taste, ...prepared } = yield* prepareReading(request)
    const { sentence, numbers } = prepared
    const { tokens } = sentence

    const all = wordsOf(sentence, numbers, () => false)
    const tasteClauses = new Set(
      tokens.flatMap((token, i) =>
        all.longest(i, taste) > 0 ? [token.clause] : [],
      ),
    )
    const reading: Reading = {
      ...prepared,
      blocked: (i) => tasteClauses.has(tokens[i]?.clause ?? -1),
    }
    const used = yield* claimWords(reading)

    const applied = new Set(request.fields ?? READERS.map((r) => r.field))
    const { understood, ambiguities } = itemsOf(used, applied, all)
    const notUnderstood = notUnderstoodOf(reading, used, applied, all)

    return {
      text: request.text,
      request: understood.reduce<ReadFields>(
        (merged, item) => mergeReadFields(merged, item.request),
        {},
      ),
      understood,
      notUnderstood,
      ambiguities,
    }
  })
