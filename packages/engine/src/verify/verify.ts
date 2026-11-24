// Answer verification (`verificar/__init__.py`): checks Claude's answer,
// film by film and Presente by Presente, against the Session's file.
//
// Each film of the answer opens with a numbered title. Right under it
// comes the presentation header (poster, card, synopsis, coverage), which
// is not Evidence and is not checked. From the first list line on, each
// line of the block must be an Evidence the Session has for that film and
// that label.
//
// Two Evidence formats count:
//
//     - **Você:** <text> (<source>, <date>) *(forte, nota)*
//     - ●●● **Você:** <text> (<source>, <date>) *(nota)*      # #32: Força in the marker
//
// In the second, the label may join Presentes ("Ana e Teo") when the line
// holds for each of them, as "sem fato" does.
//
// The answer, like the body, is Portuguese prose: the Força and Tipo words
// here are the body's (`STRENGTH_IN_BODY`, `KIND_IN_BODY`).

import { Effect } from 'effect'
import { pyStrip, pySplitlines } from '../compat/text.ts'
import { PY_WHITESPACE_CLASS } from '../compat/whitespace.ts'
import {
  isMapping,
  isSequence,
  pyStrValue,
  type YamlMapping,
} from '../data/yaml.ts'
import { readPeople } from '../people/people.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import {
  KIND_IN_BODY,
  readSession,
  STRENGTH_IN_BODY,
} from '../sessions/file.ts'

export interface VerifyRequest {
  /** The Session id. */
  readonly session: string
  /** The answer, in Markdown, in the skill's format. */
  readonly text: string
}

export interface Verification {
  readonly valid: boolean
  /** The lines the Session does not back, in the answer's order. */
  readonly invalidLines: ReadonlyArray<string>
}

/** Python's `FORCAS` and `TIPOS`, in their order: the words the body
 * writes. */
const STRENGTHS = [
  STRENGTH_IN_BODY.weak,
  STRENGTH_IN_BODY.moderate,
  STRENGTH_IN_BODY.strong,
]
const KINDS = Object.values(KIND_IN_BODY)
const GUESS = KIND_IN_BODY.guess

const MARKERS: Readonly<Record<string, string>> = {
  '●●●': 'forte',
  '●●○': 'moderada',
  '●○○': 'fraca',
}

const S = PY_WHITESPACE_CLASS
/** The same set, to go inside another class. */
const S_INSIDE = PY_WHITESPACE_CLASS.slice(1, -1)
/** `\d` of a Python `str` pattern: any Unicode decimal digit. */
const D = '\\p{Nd}'
const any = (words: ReadonlyArray<string>) => words.join('|')

const TITLE = new RegExp(`^${S}*(?:#{1,6}${S}+)?(?:\\*\\*)?(${D}+)\\.${S}`, 'u')
const IN_BLOCKS = new RegExp(`^${S}*#{1,6}${S}+(${D}+)\\.${S}+(.+?)${S}*$`, 'u')
const EVIDENCE = new RegExp(
  `^${S}*(?:[-+*]${S}|(?:\\*\\*)?Evidência:|(?:${any(Object.keys(MARKERS))})${S})`,
  'u',
)
const LIST = new RegExp(`^${S}*[-+*]${S}`, 'u')
const STRENGTH_AND_KIND = new RegExp(
  `\\((?:(?:${any(STRENGTHS)}), )?(?:${any(KINDS)})\\)\\*?$`,
  'u',
)
const WITH_MARKER = new RegExp(
  `^- (${any(Object.keys(MARKERS))}) \\*\\*(.+?):\\*\\* (.*) \\*\\((${any(KINDS)})\\)\\*$`,
  'u',
)
const GUESS_MARK = 'sem fato que o sustente'
/** The old format (#30): the poster before the title and the `\` break at
 * its end. */
const POSTER = new RegExp(`^!\\[[^\\]]*\\]\\([^)${S_INSIDE}]*\\)${S}+`, 'u')

/** `str.isdigit()` beyond the decimal digits: superscripts, circled and
 * other numbered characters (Python 3.12, Unicode 15.0). */
const DIGIT = new RegExp(
  `^[${D}\\u{b2}-\\u{b3}\\u{b9}\\u{1369}-\\u{1371}\\u{19da}\\u{2070}\\u{2074}-\\u{2079}` +
    '\\u{2080}-\\u{2089}\\u{2460}-\\u{2468}\\u{2474}-\\u{247c}\\u{2488}-\\u{2490}\\u{24ea}' +
    '\\u{24f5}-\\u{24fd}\\u{24ff}\\u{2776}-\\u{277e}\\u{2780}-\\u{2788}\\u{278a}-\\u{2792}' +
    '\\u{10a40}-\\u{10a43}\\u{10e60}-\\u{10e68}\\u{11052}-\\u{1105a}\\u{1f100}-\\u{1f10a}]',
  'u',
)
const DECIMAL = /^\p{Nd}$/u

/** `int()` of a run of decimal digits. Unicode lays each set of decimal
 * digits out as 0 to 9 in a row, so a digit's value is its distance to the
 * start of its run, modulo 10. */
const decimalValue = (digits: string): number => {
  let value = 0
  for (const char of digits) {
    let start = char.codePointAt(0) ?? 0
    while (DECIMAL.test(String.fromCodePoint(start - 1))) start--
    value = value * 10 + (((char.codePointAt(0) ?? 0) - start) % 10)
  }
  return value
}

/** Python's `str.rpartition`. */
const rpartition = (
  text: string,
  separator: string,
): [string, string, string] => {
  const at = text.lastIndexOf(separator)
  return at < 0
    ? ['', '', text]
    : [text.slice(0, at), separator, text.slice(at + separator.length)]
}

interface SessionFilm {
  readonly title: string
  readonly guess: boolean
  /** The title as the old format writes it: `**N. Título** (ano, duração)`. */
  readonly old: string
  /** Every allowed line, in the first format. */
  readonly lines: Set<string>
}

/** Checks the answer against the Session (`verificar`); the invalid lines
 * in the answer's order. */
export const verifyAnswer = (
  request: VerifyRequest,
): Effect.Effect<Verification, EngineError, EngineServices> =>
  Effect.gen(function* () {
    const { frontmatter: front, body } = yield* readSession(request.session)
    let owner: unknown = front.get('owner') ?? null
    if (!front.has('owner'))
      owner = (yield* readPeople).find((p) => p.owner)?.slug ?? null

    const films = readRecommendation(front, body, owner)
    const invalid: string[] = []
    let allowed: ReadonlySet<string> = new Set()
    // null outside a film; 'header' right after the title; 'evidence' from
    // the first list line on.
    let state: 'header' | 'evidence' | null = null
    for (const line of pySplitlines(request.text)) {
      let title = line.replace(POSTER, '')
      if (title.endsWith('\\')) title = title.slice(0, -1)
      if (TITLE.test(title)) {
        const film = filmOfTitle(title, films)
        if (film === undefined) invalid.push(line)
        allowed = film?.lines ?? new Set()
        state = 'header'
      } else if (pyStrip(line) === '---') state = null
      else if (state === 'header' && !LIST.test(line)) continue
      else if (!pyStrip(line)) state = state === 'evidence' ? null : state
      else if (
        state !== null ||
        EVIDENCE.test(line) ||
        STRENGTH_AND_KIND.test(line)
      ) {
        state = state === null ? null : 'evidence'
        if (!isAllowed(line, allowed)) invalid.push(line)
      }
    }
    return { valid: invalid.length === 0, invalidLines: invalid }
  })

/** The Session's film the answer's title names (`_filme_do_titulo`).
 *
 * Old format: `**N. Título** (ano, duração)`, as the Session wrote it.
 * In blocks: `### N. Título`, or `### N. Título em português *(Título
 * original)*`, with ` — sem fato que o sustente` at the end when the film
 * has only guesses. */
const filmOfTitle = (
  title: string,
  films: ReadonlyMap<number, SessionFilm>,
): SessionFilm | undefined => {
  for (const film of films.values()) if (title === film.old) return film
  const match = IN_BLOCKS.exec(title)
  const film = match ? films.get(decimalValue(match[1] ?? '')) : undefined
  if (match === null || film === undefined) return undefined
  let name = match[2] ?? ''
  const mark = ` — ${GUESS_MARK}`
  if (name.endsWith(mark) !== film.guess) return undefined
  if (name.endsWith(mark)) name = name.slice(0, -mark.length)
  const original = film.title
  if (
    name === original ||
    (name.endsWith(` *(${original})*`) && name !== `*(${original})*`)
  )
    return film
  return undefined
}

/** A line the Session backs (`_permitida`): as written, or in the marker
 * format, once per Presente of a joined label. */
const isAllowed = (line: string, allowed: ReadonlySet<string>): boolean => {
  if (allowed.has(line)) return true
  const match = WITH_MARKER.exec(line)
  if (!match) return false
  const [, marker = '', label = '', text = '', kind = ''] = match
  let labels = [label]
  const known = new Set(
    [...allowed].map((p) => {
      const head = p.split(':**')[0] ?? ''
      return head.startsWith('- **') ? head.slice('- **'.length) : head
    }),
  )
  if (!known.has(label)) labels = label.split(/, | e /u).filter((l) => l)
  const strength = MARKERS[marker]
  return labels.every((l) =>
    allowed.has(`- **${l}:** ${text} *(${strength}, ${kind})*`),
  )
}

/** position → film, from the Session's body (`_ler_recomendacao`). */
const readRecommendation = (
  front: YamlMapping,
  body: string,
  owner: unknown,
): ReadonlyMap<number, SessionFilm> => {
  const listed = front.get('recommendation')
  const byPosition = new Map<string, YamlMapping>()
  for (const item of isSequence(listed) ? listed : [])
    if (isMapping(item))
      byPosition.set(pyStrValue(item.get('position') ?? null), item)
  const attendeesValue = front.get('attendees')
  const attendees = isSequence(attendeesValue) ? attendeesValue : []

  const films = new Map<number, SessionFilm>()
  let filmLines = new Set<string>()
  let labels: string[] = []
  let index = 0
  for (const line of pySplitlines(body)) {
    if (DIGIT.test(line)) {
      const position = line.split('.')[0] ?? ''
      const film = byPosition.get(position)
      const old = film ? responseHeader(line, film) : null
      filmLines = new Set()
      if (film && old)
        films.set(decimalValue(position), {
          title: pyStrValue(film.get('title') ?? null),
          guess: line.endsWith(` · ${GUESS_MARK}`),
          old,
          lines: filmLines,
        })
      labels = []
      index = 0
    } else if (line.startsWith('   - ')) {
      // The file writes the groups in the Presentes' order, then the film's.
      labels = [line.slice('   - '.length)]
      if (index < attendees.length && attendees[index] === owner)
        labels.push('Você')
      index++
    } else if (line.startsWith('     - Evidência: ')) {
      const summary = summarize(line.slice('     - Evidência: '.length))
      if (summary !== null)
        for (const label of labels) filmLines.add(`- **${label}:** ${summary}`)
    }
  }
  return films
}

/** The film's line as the old answer format writes it, or null
 * (`_cabecalho_da_resposta`). */
const responseHeader = (line: string, film: YamlMapping): string | null => {
  const title = `${pyStrValue(film.get('position') ?? null)}. ${pyStrValue(film.get('title') ?? null)}`
  if (!line.startsWith(title)) return null
  const [metadata, separator, end] = rpartition(
    line.slice(title.length),
    ` · ${pyStrValue(film.get('id') ?? null)}`,
  )
  if (!separator || (end !== '' && end !== ` · ${GUESS_MARK}`)) return null
  const mark = end ? ` — ${GUESS_MARK}` : ''
  return `**${title}**${metadata}${mark}`
}

/** A body Evidence as the answer writes it (`_resumir`). */
const summarize = (line: string): string | null => {
  let [text, , kind] = rpartition(line, ' · Tipo: ')
  let strength: string
  ;[text, , strength] = rpartition(text, ' · Força: ')
  if (!KINDS.includes(kind) || !STRENGTHS.includes(strength)) return null
  if (kind !== GUESS) {
    const [reason, separator, source] = rpartition(text, ' · Fonte: ')
    if (separator) text = `${reason} (${source})`
  }
  return `${text} *(${strength}, ${kind})*`
}
