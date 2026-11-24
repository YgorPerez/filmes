// The Session file in filmes-dados: `sessions/<date>-<attendees>.md`
// (`sessao/arquivo.py`). The file is the truth; the database keeps a copy
// (`database.ts`).
//
// Frontmatter, in English keys (key-migration's `session` table):
//
//     date: 2026-11-20
//     owner: bruno                        # the Dono who opened it
//     attendees: [bruno, iara]            # slugs
//     context: {request, max_duration, moods, constraints}
//     rule: {name: default}               # or {name: by, person: iara}
//     recommendation:                     # the list, for the Feedback to find the position
//       - {position: 1, id: tt9000104, title: As Horas Lentas}
//     chosen: null                        # until the Feedback
//     chosen_in_recommendation: null
//     feedback: null                      # {recorded_on, reactions} once given
//
// Later tickets add `shown`, `kept`, `dropped`, `replies`, `swapped`,
// `redone_on` and `versions` (the earlier versions, oldest first); the
// current version is the top of the frontmatter, numbered
// `len(versions) + 1`.
//
// The body holds the Recomendação with every Evidence in the full line
// format, in Portuguese (it is prose the verifier reads):
//
//     ## Recomendação
//
//     1. As Horas Lentas (2021, 1h44) · tt9000104
//        - Bruno
//          - Evidência: ... · Fonte: ..., 2025-06-01 · Força: forte · Tipo: nota
//        - Filme
//          - Evidência: ... · Fonte: IMDb · Força: forte · Tipo: metadado

import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Effect } from 'effect'
import { pyInt } from '../compat/fact-id.ts'
import { pySplitlines } from '../compat/text.ts'
import { readMarkdown, writeMarkdown } from '../data/markdown.ts'
import {
  isMapping,
  isSequence,
  pyDate,
  pyTruthy,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import type { EvidenceJson } from '../evidence/Evidence.ts'
import type { Kind, Strength } from '../evidence/strength.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'

/** The Sessions' folder inside filmes-dados. */
export const SESSIONS_FOLDER = 'sessions'

/** `sessions/<id>.md`: where a Session is, relative to filmes-dados. */
export const sessionRelative = (id: string): string =>
  `${SESSIONS_FOLDER}/${id}.md`

/** The Sessions' folder of this request's filmes-dados. */
export const sessionsFolder: Effect.Effect<string, EngineError, Environment> =
  Effect.map(
    Effect.flatMap(Environment, (env) => env.path('data')),
    (data) => join(data, SESSIONS_FOLDER),
  )

/** The file of a Session id; an id that is a path is `invalid_usage`. */
export const sessionPath = (
  id: string,
): Effect.Effect<string, EngineError, Environment> =>
  Effect.gen(function* () {
    if (!id || basename(id) !== id || id === '.' || id === '..')
      return yield* engineError(
        'invalid_usage',
        'passe o ID da Sessão sem o caminho do arquivo',
      )
    return join(yield* sessionsFolder, `${id}.md`)
  })

/** Every Session id in filmes-dados, sorted (`arquivo.ids`). */
export const sessionIds: Effect.Effect<
  ReadonlyArray<string>,
  EngineError,
  Environment
> = Effect.flatMap(sessionsFolder, (folder) =>
  Effect.sync(() =>
    existsSync(folder)
      ? readdirSync(folder, { withFileTypes: true })
          .filter((entry) => entry.name.endsWith('.md'))
          .map((entry) => entry.name.slice(0, -'.md'.length))
          .sort(byCodePoint)
      : [],
  ),
)

/** Python's `sorted` on text: by code point, not by UTF-16 unit. */
const byCodePoint = (a: string, b: string): number => {
  const x = Array.from(a, (c) => c.codePointAt(0) ?? 0)
  const y = Array.from(b, (c) => c.codePointAt(0) ?? 0)
  for (let i = 0; i < Math.min(x.length, y.length); i++)
    if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0)
  return x.length - y.length
}

export interface SessionFile {
  readonly id: string
  /** English keys, as filmes-dados has them; dates as text. */
  readonly frontmatter: YamlMapping
  readonly body: string
}

const LEGACY_RULE = 'media-sem-miseria-com-justica'

/** The `#10` prototype listed the films only in the body. */
const PROTOTYPE_LINE = /^(\d+)\. (.+) \((tt\d+)\)$/gmu

/** The Session's frontmatter and body (`arquivo.ler`): `unknown_session`
 * when there is no file, `invalid_data` without `date`, `attendees` or
 * `rule`. The prototype's rule and body-only list are read as today's. */
export const readSession = (
  id: string,
): Effect.Effect<SessionFile, EngineError, Environment> =>
  Effect.gen(function* () {
    const file = yield* sessionPath(id)
    if (!(yield* Effect.sync(() => existsSync(file))))
      return yield* engineError(
        'unknown_session',
        `não há Sessão '${id}' em ${yield* sessionsFolder}`,
      )
    const { frontmatter, body } = yield* readMarkdown(file)
    const front = new Map(isMapping(frontmatter) ? frontmatter : [])
    // Python's field names, as its message has them (#86).
    for (const [key, name] of [
      ['date', 'data'],
      ['attendees', 'presentes'],
      ['rule', 'regra'],
    ] as const)
      if (!front.has(key))
        return yield* engineError(
          'invalid_data',
          `${file}: falta o campo ${name}`,
        )
    if (front.get('rule') === LEGACY_RULE)
      front.set('rule', new Map([['name', 'default']]))
    if (!front.has('recommendation'))
      front.set(
        'recommendation',
        Array.from(
          body.matchAll(PROTOTYPE_LINE),
          ([, position, title, film]) =>
            new Map<string, YamlValue>([
              ['position', pyInt(Number(position))],
              ['id', film ?? ''],
              ['title', title ?? ''],
            ]),
        ),
      )
    return { id, frontmatter: front, body }
  })

/** Where Python wrote a `date` object, which PyYAML writes plain. */
const dated = (front: YamlMapping): YamlMapping => {
  const date = (value: YamlValue | undefined): YamlValue | undefined =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
      ? pyDate(value)
      : value
  const datedKeys = (
    mapping: YamlValue | undefined,
    keys: ReadonlyArray<string>,
  ): YamlValue | undefined => {
    if (!isMapping(mapping)) return mapping
    const out = new Map(mapping)
    for (const key of keys) if (out.has(key)) out.set(key, date(out.get(key)) ?? null)
    return out
  }
  const replies = (value: YamlValue | undefined) =>
    isSequence(value) ? value.map((r) => datedKeys(r, ['date']) ?? null) : value
  const version = (mapping: YamlValue | undefined): YamlValue | undefined => {
    if (!isMapping(mapping)) return mapping
    const out = new Map(datedKeys(mapping, ['date', 'redone_on']) as YamlMapping)
    if (out.has('replies')) out.set('replies', replies(out.get('replies')) ?? null)
    if (out.has('feedback'))
      out.set('feedback', datedKeys(out.get('feedback'), ['recorded_on']) ?? null)
    return out
  }
  const out = new Map(version(front) as YamlMapping)
  const versions = out.get('versions')
  if (isSequence(versions))
    out.set('versions', versions.map((v) => version(v) ?? null))
  return out
}

/** Writes the Session's file (`arquivo.escrever`): through a temporary
 * file in the same folder, so a reader never sees half of it. The dates
 * Python kept as `date` objects (`date`, `redone_on`, `recorded_on`, a
 * reply's and a version's `date`) go plain. */
export const writeSession = (
  id: string,
  frontmatter: YamlMapping,
  body: string,
): Effect.Effect<void, EngineError, Environment> =>
  Effect.gen(function* () {
    const file = yield* sessionPath(id)
    const temporary = `${file}.${process.pid}.tmp`
    yield* writeMarkdown(temporary, dated(frontmatter), body).pipe(
      Effect.andThen(Effect.sync(() => renameSync(temporary, file))),
      Effect.ensuring(
        Effect.sync(() => rmSync(temporary, { force: true })),
      ),
    )
  })

/** A Session with no Feedback yet (`arquivo.aberta`). */
export const isOpen = (front: YamlMapping): boolean =>
  !pyTruthy(front.get('feedback'))

/** The fields of a version, as they sit at the top of the frontmatter
 * (the current one) and in each item of `versions`. */
export const VERSION_EXTRAS = [
  'shown',
  'kept',
  'dropped',
  'replies',
  'swapped',
] as const

/** The version at the top of the frontmatter, shaped as an item of
 * `versions` (`arquivo.versao_atual`). */
export const currentVersion = (front: YamlMapping): YamlMapping => {
  const versions = front.get('versions')
  const version = new Map<string, YamlValue>([
    ['version', pyInt((isSequence(versions) ? versions.length : 0) + 1)],
    [
      'date',
      pyTruthy(front.get('redone_on'))
        ? (front.get('redone_on') ?? null)
        : (front.get('date') ?? null),
    ],
    ['attendees', front.get('attendees') ?? null],
    ['context', front.get('context') ?? null],
    ['rule', front.get('rule') ?? null],
    [
      'recommendation',
      pyTruthy(front.get('recommendation'))
        ? (front.get('recommendation') ?? null)
        : [],
    ],
  ])
  for (const field of VERSION_EXTRAS)
    if (front.has(field)) version.set(field, front.get(field) ?? null)
  return version
}

/** The list the Dono saw of a version: the Cartaz's `shown`, or else the
 * Recomendação (`arquivo.na_tela`). */
export const onScreen = (version: YamlMapping): ReadonlyArray<YamlValue> => {
  for (const field of ['shown', 'recommendation']) {
    const list = version.get(field)
    if (isSequence(list) && list.length > 0) return list
  }
  return []
}

/** `<date>-<attendees>`, with -2, -3... when that name is taken
 * (`arquivo.novo_id`). */
export const newSessionId = (
  date: string,
  parts: ReadonlyArray<string>,
): Effect.Effect<string, EngineError, Environment> =>
  Effect.gen(function* () {
    const base = `${date}-${parts.join('-')}`
    for (let n = 1; ; n++) {
      const id = n === 1 ? base : `${base}-${n}`
      const file = yield* sessionPath(id)
      if (!(yield* Effect.sync(() => existsSync(file)))) return id
    }
  })

// --- the body ----------------------------------------------------------------

/** Força and Tipo as the body writes them, in Portuguese (a test keeps
 * them equal to key-migration's tables). */
export const STRENGTH_IN_BODY: Readonly<Record<Strength | 'guess', string>> = {
  strong: 'forte',
  moderate: 'moderada',
  weak: 'fraca',
  guess: 'palpite',
}

export const KIND_IN_BODY: Readonly<Record<Kind, string>> = {
  metadata: 'metadado',
  rating: 'nota',
  stated: 'declarado',
  report: 'relato',
  review: 'review',
  guess: 'palpite',
}

/** A film of the Recomendação, as much as the body needs. */
export interface BodyFilm {
  readonly position: number
  readonly id: string
  readonly title: string
  readonly year: number | null
  readonly runtimeMinutes: number | null
  readonly onlyGuesses: boolean
  /** By Presente slug, in the Presentes' order. */
  readonly evidence: Readonly<Record<string, ReadonlyArray<EvidenceJson>>>
  readonly filmLines: ReadonlyArray<EvidenceJson>
}

/** 104 is "1h44"; 120 is "2h00"; 45 is "45min" (`arquivo.duracao`). */
export const sessionDuration = (minutes: number): string =>
  minutes >= 60
    ? `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
    : `${minutes}min`

/** One Evidence in the full line format (`arquivo.linha_completa`). */
export const fullLine = (evidence: EvidenceJson): string => {
  const parts = [`Evidência: ${evidence.text}`]
  if (evidence.source)
    parts.push(
      `Fonte: ${evidence.source}${evidence.date ? `, ${evidence.date}` : ''}`,
    )
  parts.push(
    `Força: ${STRENGTH_IN_BODY[evidence.strength]}`,
    `Tipo: ${KIND_IN_BODY[evidence.kind]}`,
  )
  return parts.join(' · ')
}

const yearAndDuration = (film: BodyFilm): string => {
  const parts: string[] = []
  if (film.year) parts.push(String(film.year))
  if (film.runtimeMinutes) parts.push(sessionDuration(film.runtimeMinutes))
  return parts.length > 0 ? ` (${parts.join(', ')})` : ''
}

/** The body: per film, each Presente's Evidence and the film's lines, all
 * of them, even those the answer does not show (`arquivo.corpo`). `names`
 * gives a Presente's name by slug. */
export const sessionBody = (
  films: ReadonlyArray<BodyFilm>,
  names: ReadonlyMap<string, string>,
): string => {
  const lines = ['## Recomendação', '']
  for (const film of films) {
    let header = `${film.position}. ${film.title}${yearAndDuration(film)} · ${film.id}`
    if (film.onlyGuesses) header += ' · sem fato que o sustente'
    lines.push(header)
    for (const [person, evidence] of Object.entries(film.evidence)) {
      lines.push(`   - ${names.get(person) ?? person}`)
      for (const e of evidence) lines.push(`     - ${fullLine(e)}`)
    }
    if (film.filmLines.length > 0) {
      lines.push('   - Filme')
      for (const e of film.filmLines) lines.push(`     - ${fullLine(e)}`)
    }
  }
  return `${lines.join('\n')}\n`
}

/** An Evidence read back from the body, its Força and Tipo in English. */
export interface BodyEvidence {
  readonly text: string
  readonly source: string | null
  readonly date: string | null
  readonly strength: Strength | 'guess'
  readonly kind: Kind
}

export interface FilmInBody {
  readonly position: number
  readonly id: string
  readonly onlyGuesses: boolean
  /** By Presente slug, in the Presentes' order; the strongest first. */
  readonly evidence: Readonly<Record<string, ReadonlyArray<BodyEvidence>>>
}

const FILM_HEADER = /^(\d+)\. .* · (tt\d+)( · sem fato que o sustente)?$/u
const SOURCE_AND_DATE = /^(.*), (\d{4}-\d{2}-\d{2})$/u

const fromBody = <A extends string>(
  table: Readonly<Record<A, string>>,
  value: string,
): A | undefined =>
  (Object.keys(table) as A[]).find((name) => table[name] === value)

/** Python's `str.rpartition`. */
const rpartition = (text: string, separator: string): [string, string, string] => {
  const at = text.lastIndexOf(separator)
  return at < 0
    ? ['', '', text]
    : [text.slice(0, at), separator, text.slice(at + separator.length)]
}

const bodyEvidence = (line: string): BodyEvidence => {
  let [rest, , kind] = rpartition(line, ' · Tipo: ')
  let strength: string
  ;[rest, , strength] = rpartition(rest, ' · Força: ')
  const [before, separator, after] = rpartition(rest, ' · Fonte: ')
  let text = before
  let source: string | null = after
  if (!separator) {
    text = rest
    source = null
  }
  let date: string | null = null
  const match = source ? SOURCE_AND_DATE.exec(source) : null
  if (match) {
    source = match[1] ?? ''
    date = match[2] ?? null
  }
  return {
    text,
    source,
    date,
    // A line written by hand may name neither; it keeps the text as is.
    strength: fromBody(STRENGTH_IN_BODY, strength) ?? (strength as 'guess'),
    kind: fromBody(KIND_IN_BODY, kind) ?? (kind as Kind),
  }
}

/** The inverse of `sessionBody` (`arquivo.filmes_do_corpo`): per film, its
 * position, id, whether it was only guesses, and each Presente's Evidence
 * in the written order. The groups go to the Presentes in order; the one
 * after them is the film's lines, which this leaves out. */
export const filmsInBody = (
  attendees: ReadonlyArray<string>,
  body: string,
): ReadonlyArray<FilmInBody> => {
  const films: Array<{
    position: number
    id: string
    onlyGuesses: boolean
    evidence: Record<string, BodyEvidence[]>
  }> = []
  let current: (typeof films)[number] | undefined
  let group: string | undefined
  let index = 0
  for (const line of pySplitlines(body)) {
    const match = FILM_HEADER.exec(line)
    if (match) {
      current = {
        position: Number(match[1]),
        id: match[2] ?? '',
        onlyGuesses: match[3] !== undefined,
        evidence: Object.fromEntries(attendees.map((p) => [p, []])),
      }
      films.push(current)
      group = undefined
      index = 0
    } else if (current && line.startsWith('   - ')) {
      group = attendees[index]
      index++
    } else if (current && group !== undefined && line.startsWith('     - Evidência: '))
      current.evidence[group]?.push(
        bodyEvidence(line.slice('     - Evidência: '.length)),
      )
  }
  return films
}
