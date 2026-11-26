// Perguntas par a par [pairwise questions] (#181): "which of the two did you
// like more?", asked of a Presente through the Link da Sessão.
//
// The films are the ones she has no Já visto for, by the entropy of their
// MovieLens ratings times the log of how many there are (Rashid et al.
// 2002, `entropia_movielens`): a film many people saw and that splits them
// says more about whoever answers. Past those, by IMDb votes. Adult films
// are never asked. Pairs go in that order, two films at a time, up to
// `[pairwise] pairs` per Presente and Session, answered or skipped.
//
// The answers wait in the Session's `pairwise:` until the Dono decides,
// since gosto permanente is written only after her yes:
//
//     pairwise:
//     - {person: teo, films: [tt9000201, tt9000101], choice: tt9000101, date: '2026-11-20'}
//     - {person: teo, films: [tt9000702, tt9000105], choice: null, date: '2026-11-20'}
//
// Recorded, the chosen film becomes a Nota of `PAIRWISE_RATING` (weak on the
// ruler) and the other a Já visto with no Nota; then each answer gets
// `recorded_on` (or `discarded_on`) and no longer waits.

import { Effect } from 'effect'
import type { FilmRef } from '../catalog/search.ts'
import { DataWriter } from '../data/DataWriter.ts'
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
import { PAIRWISE_SOURCE } from '../evidence/ruler.ts'
import { required, savePersonAndSync } from '../people/actions.ts'
import { resolvePerson } from '../people/people.ts'
import { addItem } from '../people/Person.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import { numOrNull, text } from '../sqlite/row.ts'
import {
  Sqlite,
  type Connection,
  type Row,
  type SqliteError,
} from '../sqlite/Sqlite.ts'
import { sessionOwner } from './feedback.ts'
import { isOpen, readSession, writeSession } from './file.ts'
import { authorFor } from './open.ts'

/** The chosen film's Nota: 3,5 of 5, weak on the ruler. */
export const PAIRWISE_RATING = 3.5

/** The Fonte of what the answers become. */
export const pairwiseSource = (session: string) =>
  `${PAIRWISE_SOURCE} ${session}`

export interface PairwiseRequest {
  readonly session: string
  /** A slug among the current Presentes. */
  readonly person: string
}

export interface PairwiseQuestions {
  /** Pairs she answered or skipped in this Session. */
  readonly answered: number
  /** The pairs left, in the order to ask. */
  readonly pairs: ReadonlyArray<readonly [FilmRef, FilmRef]>
}

export interface PairwiseAnswer extends PairwiseRequest {
  /** The pair as asked. */
  readonly films: readonly [string, string]
  /** One of `films`; null is "não vi os dois". */
  readonly choice: string | null
}

export interface WaitingAnswer {
  readonly chosen: FilmRef
  readonly other: FilmRef
}

export interface WaitingAnswers {
  readonly person: string
  readonly name: string
  readonly answers: ReadonlyArray<WaitingAnswer>
}

export interface PairwiseDecision {
  readonly session: string
  readonly person: string
  /** true is the Dono's yes; false discards the answers. */
  readonly record: boolean
}

type Stored = {
  person?: unknown
  films?: unknown
  choice?: unknown
  recorded_on?: unknown
  discarded_on?: unknown
}

const storedAnswers = (front: YamlMapping): YamlValue[] => {
  const list = front.get('pairwise')
  return pyTruthy(list) && isSequence(list) ? [...list] : []
}

const plain = (item: YamlValue): Stored =>
  isMapping(item) ? (yamlToJson(item) as Stored) : {}

const filmsOf = (answer: Stored): string[] =>
  Array.isArray(answer.films) ? answer.films.map(String) : []

const waits = (answer: Stored) =>
  answer.recorded_on === undefined && answer.discarded_on === undefined

const invalid = (message: string) => engineError('invalid_usage', message)

/** The open Session, with `person` among its Presentes. */
const sessionFor = (request: PairwiseRequest) =>
  Effect.gen(function* () {
    const file = yield* readSession(request.session)
    const { frontmatter } = file
    if (!isOpen(frontmatter))
      return yield* engineError(
        'closed_session',
        `a Sessão ${request.session} já tem Feedback`,
      )
    const attendees = frontmatter.get('attendees')
    const slugs =
      pyTruthy(attendees) && isSequence(attendees)
        ? attendees.map((a) => pyStrValue(a))
        : []
    if (!slugs.includes(request.person))
      return yield* invalid(
        `${request.person} não está entre os Presentes da Sessão ${request.session}`,
      )
    return file
  })

const QUESTION_FILMS = `
SELECT f.id, f.titulo, f.ano
FROM entropia_movielens e
JOIN filmes f ON f.id = e.filme_id
WHERE f.id NOT IN (SELECT filme_id FROM ja_vistos WHERE pessoa = ?1)
  AND f.id NOT IN (SELECT filme_id FROM adultos)
  AND f.id NOT IN (SELECT value FROM json_each(?2))
ORDER BY e.entropia * ln(e.avaliacoes) DESC, f.votos DESC, f.id
LIMIT ?3`

const BY_VOTES = `
SELECT f.id, f.titulo, f.ano
FROM filmes f
WHERE f.id NOT IN (SELECT filme_id FROM ja_vistos WHERE pessoa = ?1)
  AND f.id NOT IN (SELECT filme_id FROM adultos)
  AND f.id NOT IN (SELECT value FROM json_each(?2))
  AND f.id NOT IN (SELECT filme_id FROM entropia_movielens)
ORDER BY f.votos DESC, f.id
LIMIT ?3`

/** Each id, with its title and year; an id out of the Catálogo is its own
 * title. */
const FILMS_BY_ID = `
SELECT j.value AS id, COALESCE(f.titulo, j.value) AS titulo, f.ano
FROM json_each(?) j LEFT JOIN filmes f ON f.id = j.value`

const filmOf = (row: Row): FilmRef => ({
  id: text(row, 'id'),
  title: text(row, 'titulo'),
  year: numOrNull(row, 'ano'),
})

/** The pairs left for `person`, given the films already asked of her. */
const pairsLeft = (
  db: Connection,
  person: string,
  asked: ReadonlyArray<string>,
  pairs: number,
): Effect.Effect<Array<readonly [FilmRef, FilmRef]>, SqliteError> =>
  Effect.gen(function* () {
    const wanted = pairs * 2
    const params = [person, JSON.stringify(asked), wanted] as const
    const films = (yield* db.all(QUESTION_FILMS, ...params)).map(filmOf)
    if (films.length < wanted)
      films.push(
        ...(yield* db.all(
          BY_VOTES,
          person,
          JSON.stringify(asked),
          wanted - films.length,
        )).map(filmOf),
      )
    const out: Array<readonly [FilmRef, FilmRef]> = []
    for (let i = 0; i + 1 < films.length; i += 2)
      out.push([films[i]!, films[i + 1]!])
    return out
  })

/** Hers in this Session: how many, and every film they asked about. */
const askedOf = (front: YamlMapping, person: string) => {
  const hers = storedAnswers(front)
    .map(plain)
    .filter((a) => a.person === person)
  return { answered: hers.length, films: hers.flatMap(filmsOf) }
}

const questionsIn = (
  db: Connection,
  front: YamlMapping,
  person: string,
): Effect.Effect<PairwiseQuestions, SqliteError, Environment> =>
  Effect.gen(function* () {
    const { weights } = yield* Environment
    const { answered, films } = askedOf(front, person)
    const pairs = yield* pairsLeft(
      db,
      person,
      films,
      Math.max(0, weights.pairwise.pairs - answered),
    )
    return { answered, pairs }
  })

/** The pairs left for a Presente of an open Session. */
export const pairwiseQuestions = (
  request: PairwiseRequest,
): Effect.Effect<
  PairwiseQuestions,
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
    const { frontmatter } = yield* sessionFor(request)
    return yield* (yield* Sqlite).read((db) =>
      questionsIn(db, frontmatter, request.person),
    )
  })

/** Keeps an answer in the Session, waiting for the Dono. Only the next
 * pairs left are answerable, each once; the choice is one of the pair or
 * null. One commit, by the Session's Dono. */
export const answerPairwise = (
  answer: PairwiseAnswer,
): Effect.Effect<
  { readonly answered: number },
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { session, person, films, choice } = answer
    if (choice !== null && !films.includes(choice))
      return yield* invalid('a escolha precisa ser um dos dois filmes do par')
    const { today } = yield* Run
    const writer = yield* DataWriter
    const author = yield* authorFor(yield* sessionOwner(session))
    return yield* writer.writeFiles(
      { author, message: `pairwise ${session} ${person}` },
      (db) =>
        Effect.gen(function* () {
          const { frontmatter, body } = yield* sessionFor(answer)
          const front = new Map(frontmatter)
          const { pairs } = yield* questionsIn(
            yield* required(db),
            front,
            person,
          )
          const asked = pairs.some(
            (pair) =>
              pair.every((film) => films.includes(film.id)) &&
              films[0] !== films[1],
          )
          if (!asked)
            return yield* invalid(
              `o par ${films.join(', ')} não está entre as perguntas de ${person}`,
            )
          const stored = storedAnswers(front)
          stored.push(
            new Map<string, YamlValue>([
              ['person', person],
              ['films', [...films]],
              ['choice', choice],
              ['date', today],
            ]),
          )
          front.set('pairwise', stored)
          yield* writeSession(session, front, body)
          return { answered: askedOf(front, person).answered }
        }),
    )
  })

/** What waits for the Dono's yes, by Presente in the order each first
 * answered: each answer with a choice, as chosen and other. */
export const pairwiseAnswers = (
  session: string,
): Effect.Effect<
  ReadonlyArray<WaitingAnswers>,
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
    const { frontmatter } = yield* readSession(session)
    const waiting = storedAnswers(frontmatter)
      .map(plain)
      .filter((a) => waits(a) && typeof a.choice === 'string')
    if (waiting.length === 0) return []
    return yield* (yield* Sqlite).read((db) =>
      Effect.gen(function* () {
        const ids = [...new Set(waiting.flatMap(filmsOf))]
        const films = new Map(
          (yield* db.all(FILMS_BY_ID, JSON.stringify(ids))).map((row) => [
            text(row, 'id'),
            filmOf(row),
          ]),
        )
        const byPerson = new Map<string, WaitingAnswer[]>()
        for (const answer of waiting) {
          const person = String(answer.person)
          const chosen = String(answer.choice)
          const other = filmsOf(answer).find((f) => f !== chosen)!
          byPerson.set(person, [
            ...(byPerson.get(person) ?? []),
            { chosen: films.get(chosen)!, other: films.get(other)! },
          ])
        }
        const names = new Map(
          (yield* db.all(
            `SELECT j.value AS slug, COALESCE(p.nome, j.value) AS nome
             FROM json_each(?) j LEFT JOIN pessoas p ON p.slug = j.value`,
            JSON.stringify([...byPerson.keys()]),
          )).map((row) => [text(row, 'slug'), text(row, 'nome')]),
        )
        return [...byPerson].map(([person, answers]) => ({
          person,
          name: names.get(person)!,
          answers,
        }))
      }),
    )
  })

/** The Dono's decision on a Presente's waiting answers. Recorded, the
 * chosen films become Notas of `PAIRWISE_RATING` and the others Já vistos
 * with no Nota, skipping a film she already has a Já visto for; either
 * way the answers stop waiting. One commit. Works on a closed Session too:
 * the answers are still there. */
export const decidePairwise = (
  decision: PairwiseDecision,
): Effect.Effect<
  { readonly person: string; readonly added: number },
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { session, record } = decision
    const { today } = yield* Run
    const writer = yield* DataWriter
    const author = yield* authorFor(yield* sessionOwner(session))
    return yield* writer.writeFiles(
      {
        author,
        message: `pairwise ${record ? 'record' : 'discard'} ${session} ${decision.person}`,
      },
      (db) =>
        Effect.gen(function* () {
          const read = yield* readSession(session)
          const front = new Map(read.frontmatter)
          let person = yield* resolvePerson(decision.person)
          const slug = person.slug
          const stored = storedAnswers(front)
          const mine = stored
            .map((item, index) => [index, plain(item)] as const)
            .filter(([, a]) => a.person === slug && waits(a))
          let added = 0
          if (record) {
            const connection = yield* required(db)
            const seen = new Set(
              (yield* connection.all(
                'SELECT filme_id FROM ja_vistos WHERE pessoa = ?',
                slug,
              )).map((row) => text(row, 'filme_id')),
            )
            const labels = new Map(
              (yield* connection.all(
                FILMS_BY_ID,
                JSON.stringify(mine.flatMap(([, a]) => filmsOf(a))),
              )).map((row) => [text(row, 'id'), text(row, 'titulo')]),
            )
            for (const [, answer] of mine) {
              if (typeof answer.choice !== 'string') continue
              for (const film of filmsOf(answer)) {
                if (seen.has(film)) continue
                seen.add(film)
                const result = yield* addItem(person, 'seen', {
                  date: today,
                  source: pairwiseSource(session),
                  target: film,
                  label: labels.get(film)!,
                  rating: film === answer.choice ? PAIRWISE_RATING : null,
                })
                person = result.person
                added += Number(result.added)
              }
            }
            if (added > 0) yield* savePersonAndSync(db, person)
          }
          if (mine.length > 0) {
            for (const [index] of mine)
              stored[index] = new Map([
                ...(stored[index] as YamlMapping),
                [record ? 'recorded_on' : 'discarded_on', today],
              ])
            front.set('pairwise', stored)
            yield* writeSession(session, front, read.body)
          }
          return { person: slug, added }
        }),
    )
  })
