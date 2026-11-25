// `pessoa remover` (`filmes/comandos/pessoa.py`): takes a Declarado, a
// Relato, a Veto, a Já visto or an answered open question out of the
// Pessoa's file and the database, found by the fato_id `pessoa ver` shows or
// by its target when only one item has it.
//
// A Declarado can also be a Feedback comment, which lives in a Session's
// file: removing it takes the comment out of that Session's reaction
// (`dropComment`), in the same write.

import { Effect } from 'effect'
import { pyReprStr } from '../compat/text.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import type { Connection } from '../sqlite/Sqlite.ts'
import {
  importedStated,
  openQuestionJson,
  savePersonAndSync,
  seenJson,
  statementJson,
  vetoJson,
  writePerson,
  type OpenQuestionJson,
  type PersonServices,
  type PersonWriteError,
  type SeenJson,
  type StatementJson,
  type VetoJson,
  type WrittenBy,
} from './actions.ts'
import { dropComment } from '../sessions/feedback.ts'
import { resolvePerson } from './people.ts'
import {
  items,
  removeItem,
  type Person,
  type Section,
  type SectionItem,
} from './Person.ts'

/** What `pessoa remover` removes, by its option. */
export const REMOVABLE = [
  'stated',
  'report',
  'veto',
  'seen',
  'open_question',
] as const
export type Removable = (typeof REMOVABLE)[number]

/** The option's Portuguese word, as the messages say it. */
const WORDS: Readonly<Record<Removable, string>> = {
  stated: 'declarado',
  report: 'relato',
  veto: 'veto',
  seen: 'visto',
  open_question: 'pergunta',
}

export type RemovedJson = StatementJson | VetoJson | SeenJson | OpenQuestionJson

export interface RemoveInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  readonly kind: Removable
  /** The fato_id, or the target (tt..., Q..., a group) if only one item of
   * the kind has it. */
  readonly id: string
}

export interface RemoveResult {
  readonly person: string
  readonly kind: Removable
  readonly removed: RemovedJson
}

/** An item of her file, with how to take it out, or a Feedback comment
 * (`_Comentario`). */
type Found =
  | {
      readonly from: 'file'
      readonly json: RemovedJson
      readonly remove: Effect.Effect<Person, EngineError>
    }
  | {
      readonly from: 'feedback'
      readonly json: StatementJson
      readonly db: Connection
      readonly session: string
    }

/** The target an item is found by (`_alvo_de`). */
const targetOf = (json: RemovedJson): string | null => {
  if ('target' in json) return json.target
  if ('film' in json) return json.film
  return json.subject
}

const inSection = <S extends Section>(
  person: Person,
  section: S,
  toJson: (item: SectionItem<S>) => RemovedJson,
): Effect.Effect<Found[], EngineError> =>
  Effect.map(items(person, section), (list) =>
    list.map((item) => ({
      from: 'file',
      json: toJson(item),
      remove: removeItem(person, section, item),
    })),
  )

/** The items of the kind in her file, with their JSON as `pessoa ver`
 * shows them. */
const fileItems = (person: Person, kind: Removable, today: string) => {
  const slug = person.slug
  switch (kind) {
    case 'stated':
      return inSection(person, 'stated', (s) =>
        statementJson('declarados', slug, s, today),
      )
    case 'report':
      return inSection(person, 'reports', (s) =>
        statementJson('relatos', slug, s, today),
      )
    case 'veto':
      return inSection(person, 'vetoes', (v) => vetoJson(slug, v))
    case 'seen':
      return inSection(person, 'seen', (s) => seenJson(slug, s))
    case 'open_question':
      return inSection(person, 'open_questions', (q) =>
        openQuestionJson(slug, q),
      )
  }
}

/** Her Feedback comments (`_comentarios_do_feedback`); none without a
 * database. */
const feedbackComments = (db: Connection | null, slug: string, today: string) =>
  Effect.gen(function* () {
    if (db === null) return []
    const rows = yield* db.all(
      'SELECT fato_id, sessao FROM declarados WHERE pessoa = ? AND sessao IS NOT NULL',
      slug,
    )
    const sessions = new Map(
      rows.map((row) => [String(row.fato_id), String(row.sessao)]),
    )
    return (yield* importedStated(db, slug, today)).flatMap((json): Found[] => {
      const session = sessions.get(json.factId)
      return session === undefined
        ? []
        : [{ from: 'feedback', json, db, session }]
    })
  })

const notFound = (person: Person, kind: Removable, id: string) => {
  const word = WORDS[kind]
  const message = `${person.slug} não tem ${word} com fato_id ou alvo ${pyReprStr(id)} no arquivo`
  return kind === 'stated' && id.startsWith('letterboxd:')
    ? `${message}; ele veio de um import: tire o import com \`importar --remover\``
    : message
}

/** Takes the item out of her file and the database (`pessoa remover`). */
export const personRemove = (
  input: RemoveInput,
): Effect.Effect<RemoveResult, PersonWriteError, PersonServices> =>
  writePerson(
    input,
    `pessoa remover ${input.person}: ${WORDS[input.kind]} ${input.id}`,
    (db) =>
      Effect.gen(function* () {
        const person = yield* resolvePerson(input.person)
        const { today } = yield* Run
        const { kind, id } = input
        const all = [
          ...(yield* fileItems(person, kind, today)),
          ...(kind === 'stated'
            ? yield* feedbackComments(db, person.slug, today)
            : []),
        ]
        let found = all.filter((f) => f.json.factId === id)
        if (found.length === 0)
          found = all.filter((f) => targetOf(f.json) === id)
        const [first] = found
        if (first === undefined)
          return yield* engineError(
            `unknown_${kind}`,
            notFound(person, kind, id),
          )
        if (found.length > 1)
          return yield* engineError(
            `ambiguous_${kind}`,
            `mais de um ${WORDS[kind]} de ${person.slug} tem o alvo ${id}; ` +
              `escolha pelo fato_id: ${found.map((f) => f.json.factId).join(', ')}`,
          )
        if (first.from === 'feedback')
          yield* dropComment(first.db, first.session, person.slug)
        else yield* savePersonAndSync(db, yield* first.remove)
        return { person: person.slug, kind, removed: first.json }
      }),
  )
