// `recomendar` opens a Session; `sessoes-abertas` lists the open ones
// (`sessao/__init__.py` `abrir` and `abertas`, `comandos/recomendar.py`).
//
// Opening writes `sessions/<id>.md` with no Feedback yet, syncs its rows in
// the same transaction, and commits it to filmes-dados (`DataWriter`),
// signed by the request's Dono. The id is the date and the Presentes other
// than the Dono (the Dono alone when there is no one else).

import { join } from 'node:path'
import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { pyFloat, pyInt } from '../compat/fact-id.ts'
import {
  authorOf,
  DataWriter,
  ENGINE_AUTHOR,
  type Author,
} from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { peopleFolder, readPerson } from '../people/people.ts'
import type {
  Constraint,
  StoredConstraint,
} from '../recommendation/constraints.ts'
import {
  constraintLabel,
  storedConstraints,
} from '../recommendation/constraints/index.ts'
import type {
  Recommendation,
  RecommendRequest,
} from '../recommendation/recommend.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Owner } from '../runtime/Owner.ts'
import { Run } from '../runtime/Run.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { syncSession } from './database.ts'
import {
  currentVersion,
  isOpen,
  newSessionId,
  readSession,
  sessionBody,
  sessionIds,
  sessionRelative,
  writeSession,
} from './file.ts'
import { sessionOrder } from './order.ts'

/** Where a result names a Session: its id, its file in filmes-dados and
 * the version the result is. */
export interface SessionRef {
  readonly id: string
  readonly file: string
  readonly version: number
}

/** `recomendar`'s request: the Recomendação's, and the Dono's words. */
export interface RecommendSessionRequest extends RecommendRequest {
  /** The request as the Dono said it, kept in the Session. */
  readonly request?: string | null
}

export interface SessionRecommendation extends Recommendation {
  readonly session: SessionRef
}

/** A value of the result as YAML: an integer is an int (positions,
 * counts); the fields copied here hold no float that is a whole number. */
const toYaml = (value: unknown): YamlValue => {
  if (value === undefined || value === null) return null
  if (typeof value === 'number')
    return Number.isInteger(value) ? pyInt(value) : pyFloat(value)
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toYaml)
  return new Map(
    Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .map(([key, inner]) => [key, toYaml(inner)]),
  )
}

/** The request's context, as the Session keeps it (`_contexto`): the
 * request, the duration, the accepted Climas and the other Restrições. */
export const sessionContext = (
  request: string | null,
  moods: ReadonlyArray<string>,
  constraints: ReadonlyArray<Constraint>,
): YamlValue => {
  const duration = constraints.find((c) => c.name === 'duration')
  const maxDuration = duration?.toJson()['maxMinutes'] ?? null
  return toYaml({
    request,
    max_duration: maxDuration,
    moods,
    constraints: storedConstraints(constraints),
  })
}

/** The frontmatter fields that change when the Recomendação is redone
 * (`_campos_da_recomendacao`). */
export const recommendationFields = (
  recommendation: Recommendation,
  context: YamlValue,
): ReadonlyArray<readonly [string, YamlValue]> => {
  const fields: Array<readonly [string, YamlValue]> = [
    ['attendees', toYaml(recommendation.attendees)],
    ['context', context],
    ['rule', toYaml(recommendation.rule)],
    [
      'recommendation',
      toYaml(
        recommendation.films.map((f) => ({
          position: f.position,
          id: f.id,
          title: f.title,
          ...('new' in f && { new: f.new }),
          // The Nota prevista the Cartaz shows (#175), kept with the
          // version so an old version's Cartaz does not move when the
          // neighbours do.
          ...(f.predictedRating && { predicted_rating: f.predictedRating }),
        })),
      ),
    ],
  ]
  // Regenerating with kept films (#59): what stayed and what left, and why.
  for (const field of ['kept', 'dropped'])
    if (field in recommendation)
      fields.push([
        field,
        toYaml((recommendation as unknown as Record<string, unknown>)[field]),
      ])
  return fields
}

/** The Donos in the database, by slug. */
const databaseOwners = (db: Connection) =>
  Effect.map(
    db.all('SELECT slug FROM pessoas WHERE dono = 1 ORDER BY slug'),
    (rows) => rows.map((row) => String(row['slug'])),
  )

/** The request's Donos: the logged-in Pessoa, or every Pessoa with
 * `dono = 1` (Python's list; the first one is the Session's Dono). */
const requestOwners = (
  db: Connection,
): Effect.Effect<ReadonlyArray<string>, SqliteError> =>
  Effect.flatMap(Owner, (owner) =>
    owner !== null ? Effect.succeed([owner]) : databaseOwners(db),
  )

/** Who signs the commit: the Dono, from her file, or the engine itself
 * when there is no Dono. */
export const authorFor = (
  owner: string | undefined,
): Effect.Effect<Author, never, EngineServices> =>
  owner === undefined
    ? Effect.succeed(ENGINE_AUTHOR)
    : Effect.flatMap(peopleFolder, (folder) =>
        readPerson(join(folder, `${owner}.md`)),
      ).pipe(
        Effect.map(authorOf),
        Effect.orElseSucceed(() => ENGINE_AUTHOR),
      )

/** Opens the Session of a Recomendação (`sessao.abrir`), with no Feedback
 * yet: writes its file, syncs its rows and commits it. */
export const openSession = (
  recommendation: Recommendation,
  context: YamlValue,
): Effect.Effect<
  SessionRef,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { today } = yield* Run
    const owners = yield* (yield* Sqlite).read(requestOwners)
    const writer = yield* DataWriter
    const attendees = recommendation.attendees
    return yield* writer.write(
      {
        author: yield* authorFor(owners[0]),
        message: `open session ${today} (${attendees.join(', ')})`,
      },
      (db) =>
        Effect.gen(function* () {
          const names = new Map(
            (yield* db.all('SELECT slug, nome FROM pessoas ORDER BY slug')).map(
              (row) => [String(row['slug']), String(row['nome'])],
            ),
          )
          const others = attendees.filter((p) => !owners.includes(p))
          const id = yield* newSessionId(
            today,
            others.length > 0 ? others : attendees,
          )
          const front = new Map<string, YamlValue>([
            ['date', today],
            ['owner', owners[0] ?? null],
            ...recommendationFields(recommendation, context),
            ['chosen', null],
            ['chosen_in_recommendation', null],
            ['feedback', null],
          ])
          yield* syncSession(db, id, front)
          yield* writeSession(
            id,
            front,
            sessionBody(recommendation.films, names),
          )
          return { id, file: sessionRelative(id), version: 1 }
        }),
    )
  })

/** A Session without Feedback, as `sessoes-abertas` lists it. */
export interface OpenSession {
  readonly id: string
  readonly file: string
  readonly date: string
  readonly attendees: unknown
  /** The request as the Dono said it, or null. */
  readonly request: unknown
  /** The current version's films: `{position, id, title, new?}`. */
  readonly recommendation: unknown
  readonly version: number
}

/** Any Session, as the app's list shows it: `OpenSession` and whether it
 * is still open, the film the Feedback chose, the Climas and the
 * Restrições of the current version (their labels, `rotulo`). */
export interface SessionSummary extends OpenSession {
  readonly open: boolean
  /** The chosen film's IMDb id, or null (open, or "não vimos nada"). */
  readonly chosen: string | null
  readonly moods: ReadonlyArray<string>
  readonly constraints: ReadonlyArray<string>
}

const contextOf = (front: YamlMapping): YamlMapping | null => {
  const context = front.get('context')
  return pyTruthy(context) && isMapping(context) ? context : null
}

/** The labels of the Restrições a context keeps: the duration first (the
 * Session keeps it apart, in `max_duration`), then the others in their
 * order. A Restrição no module knows has no label and is left out. */
const contextLabels = (context: YamlMapping | null): string[] => {
  if (context === null) return []
  const maxDuration = yamlToJson(context.get('max_duration') ?? null)
  const stored = yamlToJson(context.get('constraints') ?? null)
  const asked = [
    ...(typeof maxDuration === 'number'
      ? [{ name: 'duration', max_minutes: maxDuration }]
      : []),
    ...(Array.isArray(stored) ? (stored as StoredConstraint[]) : []),
  ]
  return asked.flatMap((c) => constraintLabel(c) ?? [])
}

const summary = (id: string, front: YamlMapping): SessionSummary => {
  const context = contextOf(front)
  const recommendation = front.get('recommendation')
  const moods = yamlToJson(context?.get('moods') ?? null)
  const chosen = front.get('chosen')
  return {
    id,
    file: sessionRelative(id),
    date: pyStrValue(front.get('date') ?? null),
    attendees: yamlToJson(front.get('attendees') ?? null),
    request: context ? yamlToJson(context.get('request') ?? null) : null,
    recommendation: yamlToJson(
      pyTruthy(recommendation) && isSequence(recommendation)
        ? recommendation
        : [],
    ),
    version: Number(yamlToJson(currentVersion(front).get('version') ?? null)),
    open: isOpen(front),
    chosen: typeof chosen === 'string' ? chosen : null,
    moods: Array.isArray(moods) ? moods.map(String) : [],
    constraints: contextLabels(context),
  }
}

/** The fields `sessoes-abertas` gives, as the Python engine's. */
const openFields = (s: SessionSummary): OpenSession => ({
  id: s.id,
  file: s.file,
  date: s.date,
  attendees: s.attendees,
  request: s.request,
  recommendation: s.recommendation,
  version: s.version,
})

/** Every Session, the latest first. Reads the files only. */
export const listSessions: Effect.Effect<
  { readonly sessions: ReadonlyArray<SessionSummary> },
  EngineError,
  EngineServices
> = Effect.gen(function* () {
  const list: SessionSummary[] = []
  for (const id of yield* sessionIds)
    list.push(summary(id, (yield* readSession(id)).frontmatter))
  // `sorted(..., reverse=True)`: stable, so equal keys keep the file order.
  const sessions = list.toSorted((a, b) =>
    compareTuple([...sessionOrder(b)], [...sessionOrder(a)]),
  )
  return { sessions }
})

/** The Sessions without Feedback, the latest first (`sessao.abertas`).
 * Reads the files only. */
export const openSessions: Effect.Effect<
  { readonly sessions: ReadonlyArray<OpenSession> },
  EngineError,
  EngineServices
> = Effect.map(listSessions, ({ sessions }) => ({
  sessions: sessions.filter((s) => s.open).map(openFields),
}))
