// The Feedback (`sessao/feedback.py`, `comandos/feedback.py`): writes in the
// Session's file the chosen film and how each Presente reacted, and closes
// the Session.
//
// Reactions, as the Dono says them:
// - `dono=4`: the Dono's Nota. `iara=4,5`: a number Iara gave, relayed by
//   the Dono. Both are Nota. `iara=9/10` is the scale of 10: the Nota 4,5
//   is written and the 9/10 kept.
// - a Relato `iara=gostou` (gostou, neutro, não gostou): the Dono's
//   impression.
// - a comment `iara=texto`: what she thought, with her Nota or Relato. It
//   becomes a specific Declarado about the chosen film (`facts.ts`).
// - a Presente with no reaction gives no Fato and no satisfaction, but gets the
//   Já visto.
//
// When the Session has `shown` (the Cartaz's films), the Feedback also
// writes the chosen film's position in that list (`chosen_in_shown`) and
// returns it as `shownPosition`.

import { Effect } from 'effect'
import { pyFloat } from '../compat/fact-id.ts'
import { pythonError } from '../compat/python-error.ts'
import { casefold, pyJoinWords, pyStrip } from '../compat/text.ts'
import { PY_WHITESPACE_CLASS } from '../compat/whitespace.ts'
import { DataWriter } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { formatRating, readRating } from '../data/rating.ts'
import {
  isMapping,
  isPyInt,
  isSequence,
  pyReprValue,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import type { Kind, Strength } from '../evidence/strength.ts'
import {
  feedbackStrength,
  SEEN_STRENGTH,
  statedStrength,
  type RatingScale,
} from '../evidence/ruler.ts'
import { filmText } from '../evidence/wording.ts'
import { readRatingScale } from '../people/rating-scale.ts'
import { resolveAttendees } from '../recommendation/attendees.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Owner } from '../runtime/Owner.ts'
import { Run } from '../runtime/Run.ts'
import { numOrNull, text, textOrNull } from '../sqlite/row.ts'
import type { Connection, Row, SqliteError } from '../sqlite/Sqlite.ts'
import { ownersOf, syncSession } from './database.ts'
import { comments, reactions, sessionSeen, type ReportLevel } from './facts.ts'
import { isOpen, readSession, sessionRelative, writeSession } from './file.ts'
import { authorFor } from './open.ts'
import { syncTraktFeedback } from './trakt.ts'

export interface FeedbackRequest {
  /** The Session's id, as `sessoes-abertas` lists it. */
  readonly session: string
  /** The chosen film: an IMDb id or a title (with or without the year in
   * parentheses), in the Recomendação or not; null is "não vimos nada". */
  readonly film: string | null
  /** `PESSOA=NOTA`, from 0,5 to 5 or from 1 to 10 with "/10". */
  readonly ratings?: ReadonlyArray<string>
  /** `PESSOA=NIVEL`: gostou, neutro or não gostou. */
  readonly reports?: ReadonlyArray<string>
  /** `PESSOA=TEXTO`, with that Pessoa's Nota or Relato. */
  readonly comments?: ReadonlyArray<string>
}

export interface ChosenFilm {
  readonly id: string
  readonly title: string | null
  readonly year: number | null
  /** Its position in the Recomendação, or null when it was not there. */
  readonly position: number | null
  /** Its position in the films the Dono saw, when the Session has them. */
  readonly shownPosition?: number | null
}

/** A Fato the Feedback wrote, as an Evidence line about the chosen film. */
export interface FeedbackFact {
  readonly person: string
  readonly text: string
  readonly source: string
  readonly date: string
  readonly strength: Strength
  readonly kind: Kind
  readonly factId: string
}

export interface FeedbackResult {
  readonly session: { readonly id: string; readonly file: string }
  readonly chosen: ChosenFilm | null
  readonly facts: ReadonlyArray<FeedbackFact>
  /** The Presentes with no reaction (only with a chosen film). */
  readonly withoutReaction: ReadonlyArray<string>
  readonly warnings?: ReadonlyArray<string>
}

/** The Relato levels as the Dono says them, and as the file keeps them. */
const LEVELS: Readonly<Record<string, ReportLevel>> = {
  gostou: 'liked',
  neutro: 'neutral',
  'não gostou': 'disliked',
}

const LEVEL_SEPARATORS = new RegExp(
  `[-_${PY_WHITESPACE_CLASS.slice(1, -1)}]+`,
  'gu',
)

/** The level the Dono said, or null (`_nivel`). */
const levelOf = (value: string): ReportLevel | null => {
  const key = casefold(pyStrip(value))
    .replace(LEVEL_SEPARATORS, ' ')
    .replaceAll('nao ', 'não ')
  return Object.hasOwn(LEVELS, key) ? (LEVELS[key] ?? null) : null
}

type Reaction = Map<string, YamlValue>

/** The Pessoa of a reaction this module built. */
const personOf = (reaction: Reaction): string =>
  pyStrValue(reaction.get('person') ?? null)

/** `PESSOA=VALOR`, the Pessoa resolved and among the Presentes (`_par`). */
const pair = (
  db: Connection,
  attendees: ReadonlyArray<string>,
  option: string,
  item: string,
) =>
  Effect.gen(function* () {
    const sep = item.indexOf('=')
    const name = sep === -1 ? '' : item.slice(0, sep)
    const value = sep === -1 ? '' : item.slice(sep + 1)
    if (sep === -1 || pyStrip(name) === '' || pyStrip(value) === '')
      return yield* engineError(
        'invalid_usage',
        `${option} ${item}: use PESSOA=VALOR`,
      )
    const [person = ''] = yield* resolveAttendees(db, [name])
    if (!attendees.includes(person))
      return yield* engineError(
        'invalid_usage',
        `${option} ${item}: ${person} não estava entre os Presentes da Sessão`,
      )
    return { person, value: pyStrip(value) }
  })

const onePerPerson = (byPerson: Map<string, Reaction>, reaction: Reaction) =>
  Effect.gen(function* () {
    const person = personOf(reaction)
    if (byPerson.has(person))
      return yield* engineError(
        'invalid_usage',
        `mais de uma reação para ${person}`,
      )
    byPerson.set(person, reaction)
  })

/** The reactions, in the Presentes' order (`_reacoes`). */
const readReactions = (
  db: Connection,
  attendees: ReadonlyArray<string>,
  owners: ReadonlySet<string>,
  ratings: ReadonlyArray<string>,
  reports: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const byPerson = new Map<string, Reaction>()
    for (const item of ratings) {
      const { person, value } = yield* pair(db, attendees, '--nota', item)
      const read = yield* readRating(value).pipe(
        Effect.mapError((e) =>
          engineError(e.code, `--nota ${item}: ${e.message}`),
        ),
      )
      const reaction: Reaction = new Map<string, YamlValue>([
        ['person', person],
        ['kind', 'rating'],
        ['rating', pyFloat(read.rating)],
      ])
      if (read.tenScale !== null) reaction.set('original_rating', read.tenScale)
      if (!owners.has(person)) reaction.set('relayed', true)
      yield* onePerPerson(byPerson, reaction)
    }
    for (const item of reports) {
      const { person, value } = yield* pair(db, attendees, '--relato', item)
      if (owners.has(person))
        return yield* engineError(
          'invalid_usage',
          `--relato ${item}: o Dono fala por si com --nota`,
        )
      const level = levelOf(value)
      if (level === null)
        return yield* engineError(
          'invalid_usage',
          `--relato ${item}: o Relato é gostou, neutro ou não gostou`,
        )
      yield* onePerPerson(
        byPerson,
        new Map<string, YamlValue>([
          ['person', person],
          ['kind', 'report'],
          ['reaction', level],
        ]),
      )
    }
    return attendees.flatMap((p) => {
      const reaction = byPerson.get(p)
      return reaction === undefined ? [] : [reaction]
    })
  })

/** Puts each comment in the same Pessoa's reaction (`_comentarios`). */
const addComments = (
  db: Connection,
  attendees: ReadonlyArray<string>,
  list: ReadonlyArray<Reaction>,
  items: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const byPerson = new Map(list.map((r) => [personOf(r), r]))
    for (const item of items) {
      const { person, value } = yield* pair(db, attendees, '--comentario', item)
      const reaction = byPerson.get(person)
      if (reaction === undefined)
        return yield* engineError(
          'invalid_usage',
          `--comentario ${item}: o comentário acompanha a nota ou o Relato de ${person}`,
        )
      if (reaction.has('comment'))
        return yield* engineError(
          'invalid_usage',
          `mais de um comentário para ${person}`,
        )
      reaction.set('comment', pyJoinWords(value))
    }
  })

interface Film {
  readonly id: string
  readonly title: string | null
  readonly year: number | null
}

const DIGIT = /^\p{Nd}$/u

/** Python's `int()` of a run of Unicode decimal digits: each block of
 * decimal digits is ten code points in a row, from zero. */
const digitsValue = (digits: string): number => {
  let total = 0
  for (const char of digits) {
    let code = char.codePointAt(0) ?? 0
    let value = 0
    while (DIGIT.test(String.fromCodePoint(code - 1))) {
      code -= 1
      value += 1
    }
    total = total * 10 + (value % 10)
  }
  return total
}

const IMDB_ID = /^tt\p{Nd}+$/u
const WITH_YEAR = new RegExp(
  `^(.+?)${PY_WHITESPACE_CLASS}*\\((\\p{Nd}{4})\\)$`,
  'su',
)

const filmRow = (row: Row): Film => ({
  id: text(row, 'id'),
  title: textOrNull(row, 'titulo'),
  year: numOrNull(row, 'ano'),
})

/** The title of a Recomendação item, casefolded as Python's `str`. */
const foldedTitle = (item: YamlMapping): string => {
  const title = item.get('title')
  if (typeof title !== 'string')
    throw pythonError(
      'AttributeError',
      `'${title === null || title === undefined ? 'NoneType' : typeof title}' object has no attribute 'casefold'`,
    )
  return casefold(title)
}

const itemId = (item: YamlMapping): string => {
  const id = item.get('id')
  if (id === undefined) throw pythonError('KeyError', "'id'")
  return pyStrValue(id)
}

/** The film of an IMDb id: the Catalog's, else the Recomendação's title
 * with no year. */
const filmById = (
  db: Connection,
  wanted: string,
  recommended: ReadonlyMap<string, YamlMapping>,
): Effect.Effect<Film, SqliteError> =>
  Effect.gen(function* () {
    const row = yield* db.get(
      'SELECT id, titulo, ano FROM filmes WHERE id = ?',
      wanted,
    )
    if (row !== undefined) return filmRow(row)
    const title = recommended.get(wanted)?.get('title')
    return {
      id: wanted,
      title: title === undefined || title === null ? null : pyStrValue(title),
      year: null,
    }
  })

/** The chosen film, by IMDb id or by title, with or without the year
 * (`_filme`). A title looks in the Recomendação first, then in the whole
 * Catalog. */
const findFilm = (
  db: Connection,
  asked: string,
  recommendation: ReadonlyArray<YamlMapping>,
): Effect.Effect<Film, EngineError | SqliteError> =>
  Effect.gen(function* () {
    const wanted = pyStrip(asked)
    const recommended = new Map(recommendation.map((r) => [itemId(r), r]))
    if (IMDB_ID.test(wanted)) return yield* filmById(db, wanted, recommended)
    const matched = WITH_YEAR.exec(wanted)
    const title = matched ? String(matched[1]) : wanted
    const year = matched ? digitsValue(String(matched[2])) : null
    let candidates = (yield* db.all(
      'SELECT id, titulo, ano FROM filmes WHERE dobrar(titulo) = ? AND (? IS NULL OR ano = ?) ORDER BY votos DESC, id',
      casefold(title),
      year,
      year,
    )).map(filmRow)
    const inRecommendation = new Map(
      candidates.filter((c) => recommended.has(c.id)).map((c) => [c.id, c]),
    )
    for (const item of recommendation) {
      const id = itemId(item)
      if (inRecommendation.has(id) || foldedTitle(item) !== casefold(title))
        continue
      const row = yield* db.get('SELECT ano FROM filmes WHERE id = ?', id)
      const filmYear = row === undefined ? null : numOrNull(row, 'ano')
      if (year === null || year === filmYear)
        inRecommendation.set(id, {
          id,
          title: pyStrValue(item.get('title') ?? null),
          year: filmYear,
        })
    }
    if (inRecommendation.size === 1) return [...inRecommendation.values()][0]!
    if (inRecommendation.size > 0) candidates = [...inRecommendation.values()]
    const [only] = candidates
    if (only === undefined)
      return yield* engineError(
        'unknown_film',
        `nenhum filme do Catálogo se chama '${asked}'; passe o ID do IMDb`,
      )
    if (candidates.length === 1) return only
    const options = candidates
      .map((c) => `${filmText(c.title ?? 'None', c.year)} ${c.id}`)
      .join('; ')
    return yield* engineError(
      'ambiguous_film',
      `'${asked}' pode ser mais de um filme: ${options}`,
    )
  })

/** The film's position in a list of `{position, id}` (`_posicao`). */
const positionIn = (list: ReadonlyArray<YamlValue>, id: string): YamlValue => {
  for (const item of list)
    if (isMapping(item) && item.get('id') === id)
      return item.get('position') ?? null
  return null
}

const positionNumber = (value: YamlValue): number | null =>
  value === null
    ? null
    : isPyInt(value)
      ? Number(value.int)
      : (yamlToJson(value) as number)

const mappings = (value: YamlValue | undefined): YamlMapping[] =>
  pyTruthy(value) && isSequence(value)
    ? value.map((item) => {
        if (!isMapping(item))
          throw pythonError(
            'TypeError',
            `${pyReprValue(item)} is not a mapping`,
          )
        return item
      })
    : []

const REPORT_TEXT: Readonly<Record<ReportLevel, (film: string) => string>> = {
  liked: (film) => `gostou de ${film}`,
  neutral: (film) => `achou ${film} neutro`,
  disliked: (film) => `não gostou de ${film}`,
}

const SEEN_KIND = { declarado: 'stated', relato: 'report' } as const

/** The comments and Já vistos of the Session, as Evidence lines about the
 * chosen film. */
const ownerFactLines = (
  id: string,
  front: YamlMapping,
  owners: ReadonlySet<string>,
  name: string,
  today: string,
): FeedbackFact[] => [
  ...comments(id, front, owners).map((c): FeedbackFact => ({
    person: c.person,
    text: `disse "${c.text}" de ${name}`,
    source: c.source,
    date: c.date,
    strength: statedStrength('stated', true, c.date, today),
    kind: 'stated',
    factId: c.factId,
  })),
  ...sessionSeen(id, front, owners).map((v): FeedbackFact => ({
    person: v.person,
    text: 'já viu',
    source: v.source,
    date: v.date,
    strength: SEEN_STRENGTH,
    kind: SEEN_KIND[v.kind],
    factId: v.factId,
  })),
]

/** The Fatos written, as Evidence lines about the chosen film (`_fatos`).
 * A Nota is read on the Pessoa's scale, which already has it. */
const writtenFacts = (
  db: Connection,
  id: string,
  front: YamlMapping,
  owners: ReadonlySet<string>,
  chosen: Film,
  today: string,
) =>
  Effect.gen(function* () {
    const { weights } = yield* Environment
    const name = filmText(chosen.title ?? chosen.id, chosen.year)
    const lines: FeedbackFact[] = []
    const scales = new Map<string, RatingScale>()
    const scaleOf = (person: string) =>
      Effect.gen(function* () {
        const scale =
          scales.get(person) ?? (yield* readRatingScale(db, person, weights))
        scales.set(person, scale)
        return scale
      })
    for (const r of yield* reactions(id, front))
      lines.push({
        person: r.person,
        text:
          r.kind === 'rating'
            ? `deu ${r.originalRating ?? formatRating(r.rating ?? 0)} a ${name}`
            : REPORT_TEXT[r.reaction ?? 'neutral'](name),
        source: r.source,
        date: r.date,
        strength: feedbackStrength(
          r.kind,
          yield* scaleOf(r.person),
          r.rating ?? 0,
          r.date,
          today,
        ),
        kind: r.kind,
        factId: r.factId,
      })
    lines.push(...ownerFactLines(id, front, owners, name, today))
    return lines
  })

/** The Session's Dono, who signs the commit: the logged-in Pessoa, else
 * the Session's `owner`. */
export const sessionOwner = (id: string) =>
  Effect.gen(function* () {
    const owner = yield* Owner
    if (owner !== null) return owner
    const { frontmatter } = yield* readSession(id).pipe(
      Effect.orElseSucceed(() => ({ frontmatter: new Map() as YamlMapping })),
    )
    const field = frontmatter.get('owner')
    return pyTruthy(field) ? pyStrValue(field ?? null) : undefined
  })

/** The reactions the Feedback records, read from the request, with the
 * Session's Donos and Presentes. */
const feedbackReactions = (
  db: Connection,
  front: Map<string, YamlValue>,
  request: FeedbackRequest,
) =>
  Effect.gen(function* () {
    // The logged-in Dono records it and speaks for herself: she becomes
    // the Session's `owner`, so her reactions are not relayed, now and
    // on every reload. With no login, the Session's own `owner`.
    const speaker = yield* Owner
    if (speaker !== null) front.set('owner', speaker)
    const owners = yield* ownersOf(db, front)
    const attendees = (
      isSequence(front.get('attendees'))
        ? (front.get('attendees') as YamlValue[])
        : []
    ).map((p) => pyStrValue(p))
    const list = yield* readReactions(
      db,
      attendees,
      owners,
      request.ratings ?? [],
      request.reports ?? [],
    )
    yield* addComments(db, attendees, list, request.comments ?? [])
    return { owners, attendees, list }
  })

/** The chosen film and its positions in the Recomendação and in what was
 * shown; none for "não vimos nada", which takes no reaction. */
const chosenFilm = (
  db: Connection,
  film: string | null,
  front: YamlMapping,
  reactionCount: number,
) =>
  Effect.gen(function* () {
    const recommendation = mappings(front.get('recommendation'))
    let chosen: Film | null = null
    let position: YamlValue = null
    let shownPosition: YamlValue = null
    if (film === null) {
      if (reactionCount > 0)
        return yield* engineError(
          'invalid_usage',
          '"não vimos nada" não leva reação',
        )
    } else {
      chosen = yield* findFilm(db, film, recommendation)
      position = positionIn(recommendation, chosen.id)
      shownPosition = positionIn(mappings(front.get('shown')), chosen.id)
    }
    return { chosen, position, shownPosition }
  })

/** The chosen film as the result says it, with its positions. */
const chosenResult = (
  chosen: Film | null,
  position: YamlValue,
  shown: YamlValue | undefined,
  shownPosition: YamlValue,
): FeedbackResult['chosen'] =>
  chosen === null
    ? null
    : {
        ...chosen,
        position: positionNumber(position),
        ...(shown !== undefined &&
          shown !== null && {
            shownPosition: positionNumber(shownPosition),
          }),
      }

/** Writes the Feedback inside the write. */
const writeFeedback = (
  db: Connection,
  request: FeedbackRequest,
  today: string,
) =>
  Effect.gen(function* () {
    const id = request.session
    const { frontmatter, body } = yield* readSession(id)
    if (!isOpen(frontmatter))
      return yield* engineError(
        'closed_session',
        `a Sessão ${id} já tem Feedback`,
      )
    const front = new Map(frontmatter)
    const { owners, attendees, list } = yield* feedbackReactions(
      db,
      front,
      request,
    )
    const shown = front.get('shown')
    const { chosen, position, shownPosition } = yield* chosenFilm(
      db,
      request.film,
      front,
      list.length,
    )
    front.set('chosen', chosen?.id ?? null)
    front.set('chosen_in_recommendation', position)
    if (shown !== undefined && shown !== null)
      front.set('chosen_in_shown', shownPosition)
    front.set(
      'feedback',
      new Map<string, YamlValue>([
        ['recorded_on', today],
        ['reactions', list],
      ]),
    )
    yield* syncSession(db, id, front)
    yield* writeSession(id, front, body)

    const withReaction = new Set(list.map((r) => personOf(r)))
    const result: FeedbackResult = {
      session: { id, file: sessionRelative(id) },
      chosen: chosenResult(chosen, position, shown, shownPosition),
      facts:
        chosen === null
          ? []
          : yield* writtenFacts(db, id, front, owners, chosen, today),
      withoutReaction:
        chosen === null ? [] : attendees.filter((p) => !withReaction.has(p)),
    }
    return result
  })

/** Writes the Feedback of a Session and closes it (`feedback.registrar`):
 * the file, its rows and one commit. */
export const recordFeedback = (
  request: FeedbackRequest,
): Effect.Effect<
  FeedbackResult,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { today } = yield* Run
    const id = request.session
    const writer = yield* DataWriter
    const author = yield* authorFor(yield* sessionOwner(id))
    const result = yield* writer.write(
      { author, message: `feedback ${id}` },
      (db) => writeFeedback(db, request, today),
    )
    const warning = yield* syncTraktFeedback(id)
    return warning ? { ...result, warnings: [warning] } : result
  })

/** Takes a Pessoa's comment out of her reaction in a Session's Feedback,
 * in the file and the database; the reaction stays
 * (`feedback.tirar_comentario`). Runs inside the caller's write. */
export const dropComment = (
  db: Connection,
  id: string,
  person: string,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    const { frontmatter, body } = yield* readSession(id)
    const front = new Map(frontmatter)
    const feedback = front.get('feedback')
    if (pyTruthy(feedback) && isMapping(feedback)) {
      const list = feedback.get('reactions')
      front.set(
        'feedback',
        new Map([
          ...feedback,
          [
            'reactions',
            pyTruthy(list) && isSequence(list)
              ? list.map((r) =>
                  isMapping(r) && r.get('person') === person
                    ? new Map([...r].filter(([key]) => key !== 'comment'))
                    : r,
                )
              : (list ?? null),
          ],
        ]),
      )
    }
    yield* syncSession(db, id, front)
    yield* writeSession(id, front, body)
  })
