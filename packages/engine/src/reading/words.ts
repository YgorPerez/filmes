// The words of a sentence as the Leitura do pedido matches them: each with
// its key (no case, no accent, as the Catálogo search folds a name) and
// where it is in the sentence, so an item can quote the words as typed.
// A comma, a period and the like end a clause: no phrase crosses one.

import { searchKey } from '../catalog/search-key.ts'

/** A phrase as matched: its words' keys. */
export type Phrase = ReadonlyArray<string>

interface Token {
  readonly key: string
  readonly start: number
  readonly end: number
  /** The clause it is in, counted from 0. */
  readonly clause: number
}

const WORD = /[\p{L}\p{M}\p{N}]+/gu
const CLAUSE_END = /[,;.!?:\n]/u

/** The keys of a phrase from the vocabulary ("Pra rir" is pra, rir). */
export const phraseOf = (text: string): Phrase =>
  searchKey(text)
    .split(' ')
    .filter((key) => key !== '')

export const phrasesOf = (texts: ReadonlyArray<string>): Phrase[] =>
  texts.map(phraseOf).filter((phrase) => phrase.length > 0)

export interface Words {
  readonly length: number
  /** The key of the word at `i`, or '' past the end. */
  readonly key: (i: number) => string
  /** The clause of the word at `i`, or -1 past the end. */
  readonly clause: (i: number) => number
  /** Whether the word at `i` is there for a reader: inside the sentence,
   * not in a clause about taste, not taken by an item already. */
  readonly free: (i: number) => boolean
  /** Whether the words from `start` to before `end` are free and in one
   * clause. */
  readonly span: (start: number, end: number) => boolean
  /** How many words the longest of `phrases` takes at `i`, or 0. */
  readonly longest: (i: number, phrases: ReadonlyArray<Phrase>) => number
  /** The words from `start` to before `end`, as typed. */
  readonly text: (start: number, end: number) => string
  /** The number the word at `i` is, in digits or by name. */
  readonly number: (i: number) => number | undefined
}

export interface Sentence {
  readonly tokens: ReadonlyArray<Token>
  readonly text: string
}

export const sentenceOf = (text: string): Sentence => {
  const tokens: Token[] = []
  let clause = 0
  let last = 0
  for (const match of text.matchAll(WORD)) {
    if (tokens.length > 0 && CLAUSE_END.test(text.slice(last, match.index)))
      clause += 1
    last = match.index + match[0].length
    tokens.push({
      key: searchKey(match[0]),
      start: match.index,
      end: last,
      clause,
    })
  }
  return { tokens, text }
}

const DIGITS = /^\d+$/u

/** The words of `sentence` for the readers, where `taken(i)` says the word
 * is not free. */
export const wordsOf = (
  sentence: Sentence,
  numbers: ReadonlyMap<string, number>,
  taken: (i: number) => boolean,
): Words => {
  const { tokens } = sentence
  const free = (i: number) => i >= 0 && i < tokens.length && !taken(i)
  const span = (start: number, end: number) => {
    for (let i = start; i < end; i += 1)
      if (!free(i) || tokens[i]?.clause !== tokens[start]?.clause) return false
    return end > start
  }
  const key = (i: number) => tokens[i]?.key ?? ''
  return {
    length: tokens.length,
    key,
    clause: (i) => tokens[i]?.clause ?? -1,
    free,
    span,
    longest: (i, phrases) =>
      phrases.reduce(
        (best, phrase) =>
          phrase.length > best &&
          span(i, i + phrase.length) &&
          phrase.every((word, at) => key(i + at) === word)
            ? phrase.length
            : best,
        0,
      ),
    text: (start, end) => {
      const from = tokens[start]?.start ?? 0
      const to = tokens[end - 1]?.end ?? from
      const quoted = sentence.text.slice(from, to)
      // "Reprise (2004)": the closing parenthesis of one it opened.
      const opened = quoted.split('(').length > quoted.split(')').length
      return opened && sentence.text[to] === ')' ? `${quoted})` : quoted
    },
    number: (i) => (DIGITS.test(key(i)) ? Number(key(i)) : numbers.get(key(i))),
  }
}
