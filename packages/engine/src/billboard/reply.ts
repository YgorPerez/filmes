// `cartaz responder` (`cartaz/responder.py`): reads the text the Dono pasted
// from the Cartaz (`text.ts` has the format) and records it.
//
// The text may come with conversation around it: what counts is the line
// `#cartaz <session> v<n>` and the lines after it that match the format;
// the first one that does not ends it.
//
// - Já vi: a Já visto of the Pessoa, dated today, from "cartaz <session>";
//   with a Nota (1 to 10, the Feedback's scale), a Nota of half the number.
//   "todos" are the Presentes of the version the text shows. Pasting again
//   adds no Já visto: the one from the same source and film stays, with the
//   new Nota if another came.
// - What each Pessoa of the Já vi thought (`achou <slug>: ...`): a specific
//   Declarado of hers about the film, from the same source, as the
//   Feedback's comment. The reaction comes from the Nota: 7 to 10 likes, 1
//   to 4 dislikes, none or 5 and 6 no reaction. Pasting again replaces the
//   Cartaz's Declarado about the film.
// - Stars, comment and acrescentar: in `replies` of the text's version.
//   They are no Fato and do not touch taste. A reply equal to one the
//   version has is not written again.
// - A film line not on the screen of the text's version is skipped, with a
//   warning.
// - Trocar and Já vi take the film off the current screen, by id: an old
//   version's text counts the same; the Trocar of a film no longer on the
//   screen is ignored, with a warning. The Trocar goes in `swapped` of the
//   current version, and the film never comes back in the Session (#66).
//   `trocar: já vi` is the Trocar the Cartaz marked for a Já vi: the same,
//   but no failure in the Histórico de apostas (#326).
//
// - Clima (`clima: <name>, ...`, `clima: nenhum`): the Climas the Dono
//   chose on the Cartaz, resolved by the vocabulary (a name outside it is a
//   warning). When they differ from the current version's, the whole list
//   is redone with them: `moods` says which, and `keep` is empty. It is the
//   night's context, not taste, so nothing about it is written here.
//
// It regenerates nothing. It returns what regenerating needs: `regenerate`
// (a film dropped or acrescentar came), `keep` (the ids that stay, in
// screen order), `dropped` (with the cause), `addition` and `comments` as
// they came. Whoever asks (Claude, the app) redoes the Session with
// `recommendSession({ session, keep })`; gosto permanente from the
// acrescentar is only written after the Dono's yes, and not here.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { pyInt } from '../compat/fact-id.ts'
import { pyParseInt } from '../compat/parse.ts'
import {
  PY_SPACE_CLASS,
  pyJoinWords,
  pyReprStr,
  pySplitlines,
  pyStrip,
} from '../compat/text.ts'
import { DataWriter } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { readRating } from '../data/rating.ts'
import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { required, savePersonAndSync } from '../people/actions.ts'
import { targetLabel } from '../people/facts.ts'
import {
  addItem,
  items,
  removeItem,
  type Person,
  type Seen,
  type Statement,
  type StatementReaction,
} from '../people/Person.ts'
import { resolvePerson } from '../people/people.ts'
import type { DropCause } from '../recommendation/kept.ts'
import { resolveMoods, type Mood } from '../recommendation/moods.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { recordBetMarks } from '../sessions/bet-record.ts'
import { syncSession } from '../sessions/database.ts'
import { sessionOwner } from '../sessions/feedback.ts'
import {
  currentVersion,
  readOpenSession,
  sessionRelative,
  shownFilms,
  writeSession,
  type SessionFile,
  type ShownFilm,
} from '../sessions/file.ts'
import { authorFor } from '../sessions/open.ts'
import { NO_MOOD } from './text.ts'

// --- reading the text --------------------------------------------------------

const S = `[${PY_SPACE_CLASS}]`
const NOT_S = `[^${PY_SPACE_CLASS}]`
const D = '\\p{Nd}'

const HEADER = new RegExp(
  `^${S}*#cartaz${S}+(${NOT_S}+)${S}+v(${D}+)${S}*$`,
  'u',
)
const ADDITION = new RegExp(`^${S}*acrescentar:${S}*(.*?)${S}*$`, 'u')
const MOOD = new RegExp(`^${S}*clima:${S}*(.*?)${S}*$`, 'u')
const FILM = new RegExp(
  `^${S}*(${D}+)${S}+(tt${D}+)((?:${S}+·${S}+.*)?)${S}*$`,
  'u',
)
const LEADING_SEPARATOR = new RegExp(`^${S}+·${S}+`, 'u')
const RATED = new RegExp(`^(.+?)${S}*=${S}*(${D}+)$`, 'u')
const THOUGHT = new RegExp(`^achou(?:${S}+(${NOT_S}+))?$`, 'u')

/** The marks of one film line. `thoughts` is keyed by the name written
 * after `achou`, or null for the old `achou: ...`. */
export interface ReadMarks {
  readonly position: number
  readonly id: string
  readonly seen: string | null
  readonly thoughts: ReadonlyMap<string | null, string>
  readonly swap: boolean
  /** The Trocar is `trocar: já vi`: the Cartaz marked it for a Já vi
   * (#326). */
  readonly swapForSeen: boolean
  readonly stars: number | null
  readonly comment: string | null
}

/** The text, read (`ler`). */
export interface ReadReply {
  readonly session: string
  readonly version: number
  readonly addition: string | null
  /** The Climas of the `clima:` line, `[]` for `nenhum`; null without it. */
  readonly moods: ReadonlyArray<string> | null
  readonly films: ReadonlyArray<ReadMarks>
}

const invalid = (message: string) => engineError('invalid_usage', message)

/** A regex group, '' when it did not take part. */
const group = (match: RegExpExecArray, index: number): string =>
  match[index] ?? ''

/** Python's `int()` of digits of any script. */
const digits = (text: string): number => pyParseInt(text) ?? Number.NaN

/** Python's `str.partition`. */
const partition = (
  text: string,
  separator: string,
): [string, string, string] => {
  const at = text.indexOf(separator)
  return at < 0
    ? [text, '', '']
    : [text.slice(0, at), separator, text.slice(at + separator.length)]
}

const STARS = new Set(['1', '2', '3', '4', '5'])

const readMarks = (
  position: number,
  film: string,
  marks: string,
): Effect.Effect<ReadMarks, EngineError> =>
  Effect.gen(function* () {
    let seen: string | null = null
    const thoughts = new Map<string | null, string>()
    let swap = false
    let swapForSeen = false
    let stars: number | null = null
    let comment: string | null = null
    let rest = marks.replace(LEADING_SEPARATOR, '')
    if (rest.startsWith('comentário:')) rest = ` · ${rest}`
    const [before, separator, after] = partition(rest, ' · comentário:')
    if (separator) comment = pyJoinWords(after) || null
    for (const part of before
      .split(' · ')
      .map(pyStrip)
      .filter((p) => p !== '')) {
      const [name, , raw] = partition(part, ':')
      const value = pyStrip(raw)
      const thought = THOUGHT.exec(name)
      if (part === 'trocar') swap = true
      else if (name === 'trocar' && value === 'já vi') swap = swapForSeen = true
      else if (name === 'já vi' && value) seen = value
      else if (thought && value)
        thoughts.set(thought[1] ?? null, pyJoinWords(value))
      else if (name === 'estrelas' && STARS.has(value)) stars = Number(value)
      else
        return yield* invalid(
          `marcação desconhecida no cartaz, filme ${position} ${film}: ${pyReprStr(part)}`,
        )
    }
    if (thoughts.size > 0 && !seen)
      return yield* invalid(`achou sem Já vi, filme ${position} ${film}`)
    return {
      position,
      id: film,
      seen,
      thoughts,
      swap,
      swapForSeen,
      stars,
      comment,
    }
  })

/** Reads the pasted text (`ler`); a text with no `#cartaz` line is
 * `invalid_usage`. */
export const readReply = (
  text: string,
): Effect.Effect<ReadReply, EngineError> =>
  Effect.gen(function* () {
    const lines = pySplitlines(text)
    const start = lines.findIndex((line) => HEADER.test(line))
    const header = start < 0 ? null : HEADER.exec(lines[start] ?? '')
    if (header === null)
      return yield* invalid(
        "o texto não é de cartaz: falta a linha '#cartaz <sessão> v<n>'",
      )
    let addition: string | null = null
    let moods: string[] | null = null
    const films: ReadMarks[] = []
    for (const line of lines.slice(start + 1)) {
      if (!pyStrip(line)) continue
      const added = ADDITION.exec(line)
      if (added && addition === null && films.length === 0) {
        addition = pyJoinWords(group(added, 1)) || null
        continue
      }
      const mood = MOOD.exec(line)
      if (mood && moods === null && films.length === 0) {
        moods = group(mood, 1)
          .split(',')
          .map(pyStrip)
          .filter((name) => name !== '' && name !== NO_MOOD)
        continue
      }
      const film = FILM.exec(line)
      if (film === null) break
      films.push(
        yield* readMarks(
          digits(group(film, 1)),
          group(film, 2),
          group(film, 3),
        ),
      )
    }
    return {
      session: group(header, 1),
      version: digits(group(header, 2)),
      addition,
      moods,
      films,
    }
  })

// --- recording it ------------------------------------------------------------

export interface BillboardReplyRequest {
  /** The Session's id. */
  readonly session: string
  /** What the Dono pasted, or what the Cartaz sent. */
  readonly text: string
}

/** A Já visto the reply recorded, or found already recorded. */
export interface ReplySeen {
  readonly person: string
  readonly film: string
  readonly title: string
  /** Her Nota, on the scale of 0,5 to 5. */
  readonly rating: number | null
  /** False when the same paste had recorded it before. */
  readonly new: boolean
  /** What she thought of it. */
  readonly comment?: string
}

/** A film's stars or comment, as the reply came. */
export interface FilmNote {
  readonly position: number
  readonly id: string
  readonly title: string | null
  readonly stars?: number
  readonly comment?: string
}

export interface BillboardReply {
  readonly session: { readonly id: string; readonly file: string }
  /** The version the text was of. */
  readonly version: number
  readonly currentVersion: number
  /** A film left the current screen, acrescentar came or the Clima
   * changed. */
  readonly regenerate: boolean
  /** The ids that stay, in the current screen's order; none when the
   * Clima changed, since it redoes the whole list. */
  readonly keep: ReadonlyArray<string>
  /** What left the current screen, and why (`seen` or `swapped`). */
  readonly dropped: ReadonlyArray<ShownFilm & DropCause>
  readonly addition: string | null
  /** The Climas to redo with, when the Dono changed them; null when not. */
  readonly moods: ReadonlyArray<string> | null
  readonly comments: ReadonlyArray<FilmNote>
  readonly stars: ReadonlyArray<FilmNote>
  readonly seen: ReadonlyArray<ReplySeen>
  readonly warnings: ReadonlyArray<string>
}

type ReplyServices = EngineServices | Run
type ReplyError = EngineError | SqliteError | GitError

const listOf = (value: YamlValue | undefined): ReadonlyArray<YamlValue> =>
  pyTruthy(value) && isSequence(value) ? value : []

const slugsOf = (value: YamlValue | undefined): string[] =>
  listOf(value).map((v) => pyStrValue(v))

/** Who saw it: `[slug, rating]` from `já vi: todos` or `já vi: fulano=8,
 * beltrano` (`_quem_viu`). */
const whoSaw = (
  marks: ReadMarks,
  attendees: ReadonlyArray<string>,
): Effect.Effect<Array<[string, number | null]>, EngineError, Environment> =>
  Effect.gen(function* () {
    const value = marks.seen ?? ''
    if (value === 'todos') return attendees.map((slug) => [slug, null])
    const who: Array<[string, number | null]> = []
    for (const item of value
      .split(',')
      .map(pyStrip)
      .filter((p) => p !== '')) {
      const rated = RATED.exec(item)
      const name = rated ? group(rated, 1) : item
      const rating = rated
        ? (yield* readRating(`${group(rated, 2)}/10`)).rating
        : null
      const { slug } = yield* resolvePerson(name)
      if (!attendees.includes(slug))
        return yield* invalid(
          `já vi: ${slug} não estava entre os Presentes do cartaz (${marks.position} ${marks.id})`,
        )
      who.push([slug, rating])
    }
    return who
  })

/** What `slug` thought of the film: `achou <slug>: ...`, or the old
 * `achou: ...` with one Pessoa only (`_achou_de`). */
const thoughtOf = (
  marks: ReadMarks,
  slug: string,
  who: ReadonlyArray<string>,
): Effect.Effect<string | null, EngineError, Environment> =>
  Effect.gen(function* () {
    for (const [name, text] of marks.thoughts) {
      const owner =
        name !== null
          ? (yield* resolvePerson(name)).slug
          : who.length === 1
            ? (who[0] ?? null)
            : null
      if (name === null && owner === null)
        return yield* invalid(
          `achou sem nome vale só com uma Pessoa no Já vi (${marks.position} ${marks.id})`,
        )
      if (owner === null || !who.includes(owner))
        return yield* invalid(
          `achou ${name}: ${name} não está no Já vi (${marks.position} ${marks.id})`,
        )
      if (owner === slug) return text
    }
    return null
  })

/** The reaction of what she thought, from her Nota. */
const reactionOf = (rating: number | null): StatementReaction | null =>
  rating === null
    ? null
    : rating * 2 >= 7
      ? 'like'
      : rating * 2 <= 4
        ? 'dislike'
        : null

/** What she thought becomes a specific Declarado about the film; the
 * Cartaz's earlier one goes (`_gravar_achou`). Null when it was there. */
const withThought = (
  person: Person,
  statement: Statement,
): Effect.Effect<Person | null, EngineError> =>
  Effect.gen(function* () {
    const earlier = (yield* items(person, 'stated')).filter(
      (s) => s.source === statement.source && s.target === statement.target,
    )
    if (
      earlier.some(
        (s) => s.text === statement.text && s.reaction === statement.reaction,
      )
    )
      return null
    let updated = person
    for (const s of earlier) updated = yield* removeItem(updated, 'stated', s)
    return (yield* addItem(updated, 'stated', statement)).person
  })

/** Python's `==` of two replies, without the date. */
const sameReply = (a: YamlValue, b: YamlValue): boolean => {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => key !== 'date')
              .sort(([x], [y]) => compareTuple([x], [y]))
              .map(([key, v]) => [key, canonical(v)]),
          )
        : value
  return (
    JSON.stringify(canonical(yamlToJson(a))) ===
    JSON.stringify(canonical(yamlToJson(b)))
  )
}

/** The reply of a version (`_resposta`): stars, comments and acrescentar;
 * null when it has none. */
const replyOf = (read: ReadReply, today: string): YamlMapping | null => {
  const films = read.films
    .filter((m) => m.stars !== null || m.comment !== null)
    .map(
      (m) =>
        new Map<string, YamlValue>([
          ['position', pyInt(m.position)],
          ['id', m.id],
          ...(m.stars !== null
            ? [['stars', pyInt(m.stars)] as [string, YamlValue]]
            : []),
          ...(m.comment !== null
            ? [['comment', m.comment] as [string, YamlValue]]
            : []),
        ]),
    )
  if (films.length === 0 && read.addition === null) return null
  const reply = new Map<string, YamlValue>([['date', today]])
  if (read.addition !== null) reply.set('addition', read.addition)
  if (films.length > 0) reply.set('films', films)
  return reply
}

/** The Climas chosen, by name, when they are not the current version's;
 * null when they are, or when the text chose none. */
const changedMoods = (
  current: YamlMapping,
  chosen: ReadonlyArray<Mood> | undefined,
): string[] | null => {
  if (chosen === undefined) return null
  const context = current.get('context')
  const before = new Set(
    listOf(isMapping(context) ? context.get('moods') : undefined).map((v) =>
      pyStrValue(v),
    ),
  )
  const names = chosen.map((m) => m.name)
  return names.length === before.size && names.every((n) => before.has(n))
    ? null
    : names
}

/** The open Session and the version the text is of. */
interface OpenedVersion {
  readonly session: SessionFile
  readonly front: Map<string, YamlValue>
  readonly current: YamlMapping
  readonly currentNumber: number
  readonly versions: YamlValue[]
  readonly version: YamlMapping
}

/** Reads the Session, which must be open, and finds the text's version. */
const openVersion = (
  id: string,
  read: ReadReply,
): Effect.Effect<OpenedVersion, EngineError, Environment> =>
  Effect.gen(function* () {
    const { session, front } = yield* readOpenSession(
      id,
      'recomende sem --sessao para abrir outra',
    )
    const current = currentVersion(front)
    const currentNumber = Number(yamlToJson(current.get('version') ?? null))
    if (!(read.version >= 1 && read.version <= currentNumber))
      return yield* invalid(`a Sessão ${id} não tem a versão ${read.version}`)
    const versions = [...listOf(front.get('versions'))]
    const earlierVersion = versions[read.version - 1]
    const version: YamlMapping =
      read.version === currentNumber
        ? current
        : isMapping(earlierVersion)
          ? earlierVersion
          : new Map()
    return { session, front, current, currentNumber, versions, version }
  })

/** A Já vi of one Pessoa, as the text marked it. */
interface AskedSeen {
  readonly slug: string
  readonly film: string
  readonly rating: number | null
  readonly thought: string | null
}

/** The Já vi marks of the films, Pessoa by Pessoa. */
const askedSeen = (
  films: ReadonlyArray<ReadMarks>,
  attendees: ReadonlyArray<string>,
): Effect.Effect<AskedSeen[], EngineError, Environment> =>
  Effect.gen(function* () {
    const asked: AskedSeen[] = []
    for (const marks of films) {
      if (!marks.seen) continue
      const who = yield* whoSaw(marks, attendees)
      const slugs = who.map(([slug]) => slug)
      for (const [slug, rating] of who)
        asked.push({
          slug,
          film: marks.id,
          rating,
          thought: yield* thoughtOf(marks, slug, slugs),
        })
    }
    return asked
  })

/** One Já vi recorded on the Pessoa: the Já visto, its Nota and what she
 * thought. */
const markSeen = (
  person: Person,
  item: AskedSeen & { readonly label: string },
  source: string,
  today: string,
) =>
  Effect.gen(function* () {
    const { film, thought, label } = item
    let changed = false
    const earlier = (yield* items(person, 'seen')).find(
      (s) => s.source === source && s.target === film,
    )
    let rating = item.rating
    if (earlier === undefined) {
      const added: Seen = { date: today, source, target: film, label, rating }
      person = (yield* addItem(person, 'seen', added)).person
      changed = true
    } else if (rating !== null && rating !== earlier.rating) {
      // Pasting again updates the Nota of the Já visto the Cartaz
      // recorded, adding no other.
      person = yield* removeItem(person, 'seen', earlier)
      person = (yield* addItem(person, 'seen', { ...earlier, rating })).person
      changed = true
    } else rating = earlier.rating
    if (thought !== null) {
      const updated = yield* withThought(person, {
        date: today,
        source,
        specific: true,
        text: thought,
        reaction: reactionOf(rating),
        target: film,
        label,
      })
      if (updated !== null) {
        person = updated
        changed = true
      }
    }
    return { person, changed, rating, isNew: earlier === undefined }
  })

/** Records the Já vistos, Notas and what each one thought
 * (`_gravar_ja_vistos`). */
const recordSeen = (
  db: Connection | null,
  id: string,
  today: string,
  asked: ReadonlyArray<AskedSeen>,
) =>
  Effect.gen(function* () {
    const seen: ReplySeen[] = []
    if (asked.length === 0) return seen
    const connection = yield* required(db)
    // Every label first: a film outside the Catálogo writes nothing.
    const labelled = []
    for (const item of asked)
      labelled.push({
        ...item,
        label: yield* targetLabel(connection, item.film),
      })
    const people = new Map<string, Person>()
    const changed = new Set<string>()
    const toSave = new Map<string, Person>()
    const source = `cartaz ${id}`
    for (const item of labelled) {
      const { slug, film, thought, label } = item
      const marked = yield* markSeen(
        people.get(slug) ?? (yield* resolvePerson(slug)),
        item,
        source,
        today,
      )
      if (marked.changed) changed.add(slug)
      people.set(slug, marked.person)
      // In the order each Pessoa first changed, as Python saves them.
      if (changed.has(slug)) toSave.set(slug, marked.person)
      seen.push({
        person: slug,
        film,
        title: label,
        rating: marked.rating,
        new: marked.isNew,
        ...(thought !== null && { comment: thought }),
      })
    }
    for (const person of toSave.values()) yield* savePersonAndSync(db, person)
    return seen
  })

/** Records the stars, comments and acrescentar (`_gravar_resposta`); true
 * when the Session changed. */
const recordReplyMarks = (
  db: Connection | null,
  id: string,
  read: ReadReply,
  opened: OpenedVersion,
  today: string,
) =>
  Effect.gen(function* () {
    const reply = replyOf(read, today)
    if (reply === null) return false
    const { front, currentNumber, version, versions } = opened
    const connection = yield* required(db)
    const target: Map<string, YamlValue> =
      read.version === currentNumber ? front : new Map(version)
    const replies = listOf(target.get('replies'))
    if (replies.some((r) => sameReply(r, reply))) return false
    target.set('replies', [...replies, reply])
    if (target !== front) {
      versions[read.version - 1] = target
      front.set('versions', versions)
    }
    yield* syncSession(connection, id, front)
    return true
  })

/** The films to Trocar that are still on the current screen; the others
 * are warned about. */
const swapsOnScreen = (
  films: ReadonlyArray<ReadMarks>,
  screen: ReadonlyArray<ShownFilm>,
  currentNumber: number,
  warnings: string[],
): Set<string> => {
  const onScreen = new Set(screen.map((f) => f.id))
  const swap = new Set<string>()
  for (const marks of films) {
    if (!marks.swap) continue
    if (onScreen.has(marks.id)) swap.add(marks.id)
    else
      warnings.push(
        `trocar ${marks.id} ignorado: o filme não está mais na tela da versão ${currentNumber}`,
      )
  }
  return swap
}

/** The Aposta marks of the reply: each Já vi with a Nota, and each Trocar
 * as the owner's, but the one the Cartaz marked for a Já vi (`trocar: já
 * vi`), which teaches only through the Já vi's Nota (#326). */
const betMarksOf = (
  seen: ReadonlyArray<ReplySeen>,
  swap: ReadonlySet<string>,
  films: ReadonlyArray<ReadMarks>,
  owner: string | undefined,
  today: string,
) => [
  ...seen.flatMap(({ person, film, rating }) =>
    rating === null
      ? []
      : [{ person, film, rating, kind: 'seen' as const, date: today }],
  ),
  ...(owner === undefined
    ? []
    : [...swap]
        .filter((film) => !films.some((m) => m.id === film && m.swapForSeen))
        .map((film) => ({
          person: owner,
          film,
          rating: null,
          kind: 'swapped' as const,
          date: today,
        }))),
]

/** What the reply recorded and what regenerating needs. */
const replyResult = (input: {
  readonly id: string
  readonly read: ReadReply
  readonly opened: OpenedVersion
  readonly films: ReadonlyArray<ReadMarks>
  readonly screen: ReadonlyArray<ShownFilm>
  readonly seen: ReadonlyArray<ReplySeen>
  readonly swap: ReadonlySet<string>
  readonly moods: string[] | null
  readonly warnings: ReadonlyArray<string>
}): BillboardReply => {
  const { id, read, opened, films, screen, seen, swap, moods } = input
  const sawIt = new Map<string, string[]>()
  for (const s of seen)
    sawIt.set(s.film, [...(sawIt.get(s.film) ?? []), s.person])
  const dropped: Array<ShownFilm & DropCause> = []
  const keep: string[] = []
  for (const film of screen) {
    const people = sawIt.get(film.id)
    if (people !== undefined) dropped.push({ ...film, cause: 'seen', people })
    else if (swap.has(film.id)) dropped.push({ ...film, cause: 'swapped' })
    else keep.push(film.id)
  }
  const titles = new Map(
    [...shownFilms(opened.version), ...screen].map((f) => [f.id, f.title]),
  )
  const note = (m: ReadMarks) => ({
    position: m.position,
    id: m.id,
    title: titles.get(m.id) ?? null,
  })
  return {
    session: { id, file: sessionRelative(id) },
    version: read.version,
    currentVersion: opened.currentNumber,
    regenerate: dropped.length > 0 || read.addition !== null || moods !== null,
    keep: moods === null ? keep : [],
    dropped,
    addition: read.addition,
    moods,
    comments: films.flatMap((m) =>
      m.comment === null ? [] : [{ ...note(m), comment: m.comment }],
    ),
    stars: films.flatMap((m) =>
      m.stars === null ? [] : [{ ...note(m), stars: m.stars }],
    ),
    seen,
    warnings: input.warnings,
  }
}

/** The marked films that were on the screen of the text's version; the
 * others are warned about. */
const filmsOnVersion = (
  read: ReadReply,
  version: YamlMapping,
  warnings: string[],
): ReadMarks[] => {
  const ofVersion = new Set(shownFilms(version).map((f) => f.id))
  for (const marks of read.films)
    if (!ofVersion.has(marks.id))
      warnings.push(
        `${marks.position} ${marks.id} ignorado: o filme não estava na tela da versão ${read.version}`,
      )
  return read.films.filter((m) => ofVersion.has(m.id))
}

/** What `answerBillboard` has read before the write. */
interface ReplyInput {
  readonly db: Connection | null
  readonly id: string
  readonly read: ReadReply
  readonly chosen: {
    readonly moods: ReadonlyArray<Mood>
    readonly warnings: ReadonlyArray<string>
  } | null
  readonly today: string
  readonly owner: string | undefined
}

/** Records the reply inside the write: everything `answerBillboard` does
 * once the text is read. */
const recordReply = (input: ReplyInput) =>
  Effect.gen(function* () {
    const { db, id, read, chosen, today, owner } = input
    const opened = yield* openVersion(id, read)
    const { front, current, currentNumber, version } = opened

    const warnings: string[] = [...(chosen?.warnings ?? [])]
    const moods = changedMoods(current, chosen?.moods)
    const films = filmsOnVersion(read, version, warnings)

    const asked = yield* askedSeen(films, slugsOf(version.get('attendees')))
    const seen = yield* recordSeen(db, id, today, asked)
    const clearedComments = front.delete('refill_comments')
    let write = yield* recordReplyMarks(
      db,
      id,
      { ...read, films },
      opened,
      today,
    )

    // Trocar (`_gravar_trocados`).
    const screen = shownFilms(current)
    const swap = swapsOnScreen(films, screen, currentNumber, warnings)
    if (swap.size > 0) {
      yield* required(db)
      const swapped = slugsOf(front.get('swapped'))
      front.set('swapped', [
        ...swapped,
        ...[...swap]
          .filter((f) => !swapped.includes(f))
          .sort((a, b) => compareTuple([a], [b])),
      ])
      write = true
    }
    const betMarksChanged = recordBetMarks(
      front,
      betMarksOf(seen, swap, films, owner, today),
    )
    if (write || clearedComments || betMarksChanged)
      yield* writeSession(id, front, opened.session.body)
    return replyResult({
      id,
      read,
      opened,
      films,
      screen,
      seen,
      swap,
      moods,
      warnings,
    })
  })

/** Records the text pasted from the Cartaz (`cartaz responder`): Já vistos,
 * Notas and what each one thought, stars, comments and acrescentar, and
 * the Trocar; says whether the Session must be regenerated and what stays.
 * One commit. */
export const answerBillboard = (
  request: BillboardReplyRequest,
): Effect.Effect<BillboardReply, ReplyError, ReplyServices> =>
  Effect.gen(function* () {
    const id = request.session
    const read = yield* readReply(request.text)
    if (read.session !== id)
      return yield* invalid(
        `o texto é do cartaz da Sessão ${read.session}, não da ${id}`,
      )
    const chosen = read.moods === null ? null : yield* resolveMoods(read.moods)
    const { today } = yield* Run
    const writer = yield* DataWriter
    const owner = yield* sessionOwner(id)
    const author = yield* authorFor(owner)
    return yield* writer.writeFiles(
      { author, message: `answer billboard ${id}` },
      (db) => recordReply({ db, id, read, chosen, today, owner }),
    )
  })
