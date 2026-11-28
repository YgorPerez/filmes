// The `pessoa` actions (`filmes/comandos/pessoa.py`): create a Pessoa, show
// what is known of her, and record a Declarado, a Relato or a Já visto. A
// write goes through `DataWriter`: her file, the sync of her rows in the
// database and one commit to filmes-dados, under the write lock, so two
// requests on the same Pessoa never lose each other's change (#76 §6.3).
// She is read again inside the lock. Without a database the file is written
// alone, as in Python. The commit is by `author`, the logged-in Pessoa who
// asked (the edge passes her); without one, by `ENGINE_AUTHOR`.
//
// The results are the Python JSON in English names (ADR 0002; `pessoa ver`
// → `person view`); messages are Python's, word for word.

import { existsSync } from 'node:fs'
import { Effect } from 'effect'
import { DataWriter, ENGINE_AUTHOR, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { pyIsoDate } from '../compat/parse.ts'
import { pyJoinWords, pyReprStr } from '../compat/text.ts'
import { readRating } from '../data/rating.ts'
import { yamlToJson } from '../data/yaml.ts'
import { statedStrength } from '../evidence/ruler.ts'
import type { Kind, Strength } from '../evidence/strength.ts'
import {
  personPredictionError,
  type PersonPredictionError,
} from '../recommendation/taste-neighbors.ts'
import { Environment } from '../runtime/Environment.ts'
import { Owner } from '../runtime/Owner.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import {
  missingDatabase,
  Sqlite,
  type Connection,
  type SqliteError,
} from '../sqlite/Sqlite.ts'
import {
  adjustmentId,
  onlyGenre,
  questionId,
  ratingKindFromDb,
  reactionFromDb,
  seenId,
  statedRating,
  statementId,
  syncPerson,
  targetLabel,
  vetoId,
  type StatementTable,
} from './facts.ts'
import { personTasteAnalysis, type TasteAnalysis } from './taste-analysis.ts'
import {
  createPerson,
  resolvePerson,
  savePerson,
  type NewPerson,
} from './people.ts'
import {
  addItem,
  items,
  type Adjustment,
  type OpenQuestion,
  type Person,
  type Seen,
  type Statement,
  type StatementReaction,
  type Veto,
} from './Person.ts'

/** What a `pessoa` action needs. */
export type PersonServices = Environment | Sqlite | Run | DataWriter

/** How a `pessoa` write can fail. */
export type PersonWriteError = EngineError | SqliteError | GitError

/** Who asked for a write: the commit's author. */
export interface WrittenBy {
  /** The logged-in Pessoa; `ENGINE_AUTHOR` when none (the command line). */
  readonly author?: Author
}

// --- results -----------------------------------------------------------------

export interface PersonSummary {
  readonly person: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly owner: boolean
}

export interface VetoJson {
  readonly text: string
  readonly target: string
  readonly label: string
  readonly date: string
  /** The day of the last edit (#330), absent when never edited. */
  readonly edited?: string
  readonly factId: string
}

export interface AdjustmentJson {
  readonly link: Adjustment['link']
  readonly level: Adjustment['level']
  readonly date: string
  readonly factId: string
}

export interface OpenQuestionJson {
  readonly text: string
  readonly subject: string | null
  readonly label: string | null
  readonly date: string
  readonly skips: number
  readonly factId: string
}

/** A Declarado or a Relato. */
export interface StatementJson {
  readonly text: string
  readonly source: string
  readonly date: string
  readonly specific: boolean
  readonly reaction: StatementReaction | null
  readonly target: string | null
  readonly label: string | null
  readonly kind: 'stated' | 'report'
  readonly strength: Strength
  /** The Nota it stands for: 5 for "ama" a film, 1 for "odeia". */
  readonly rating: number | null
  /** The day of the last edit (#330), absent when never edited. */
  readonly edited?: string
  readonly factId: string
}

export interface SeenJson {
  readonly film: string
  readonly title: string
  readonly rating: number | null
  readonly date: string
  readonly source: string
  /** The day of the last edit (#330), absent when never edited. */
  readonly edited?: string
  readonly factId: string
}

/** A Nota in force (view `notas_vigentes`). */
export interface RatingJson {
  readonly filmId: string
  readonly title: string | null
  readonly rating: number
  readonly date: string
  readonly source: string
  readonly kind: Kind | null
  readonly factId: string
}

export interface PersonView extends PersonSummary {
  readonly vetoes: readonly VetoJson[]
  readonly adjustments: readonly AdjustmentJson[]
  /** From her file, then the imported ones and the Feedback comments. */
  readonly stated: readonly StatementJson[]
  readonly reports: readonly StatementJson[]
  readonly seen: readonly SeenJson[]
  readonly openQuestions: readonly OpenQuestionJson[]
  readonly imports: readonly unknown[]
  /** Null without a database, with the `warning`. */
  readonly ratings: readonly RatingJson[] | null
  /** Only when requested and enough films have a leave-one-out prediction. */
  readonly predictionError?: PersonPredictionError
  /** Only when requested and her own Escala has enough Notas (#404). */
  readonly tasteAnalysis?: TasteAnalysis
  readonly warning?: string
}

/** `edited` when the item has one. */
const editedOf = (item: { readonly edited?: string }) =>
  item.edited === undefined ? {} : { edited: item.edited }

const summary = (person: Person): PersonSummary => ({
  person: person.slug,
  name: person.name,
  aliases: person.aliases,
  owner: person.owner,
})

export const vetoJson = (slug: string, veto: Veto): VetoJson => ({
  text: veto.text,
  target: veto.target,
  label: veto.label,
  date: veto.date,
  ...editedOf(veto),
  factId: vetoId(slug, veto),
})

export const adjustmentJson = (
  slug: string,
  adjustment: Adjustment,
): AdjustmentJson => ({
  link: adjustment.link,
  level: adjustment.level,
  date: adjustment.date,
  factId: adjustmentId(slug, adjustment),
})

export const openQuestionJson = (
  slug: string,
  question: OpenQuestion,
): OpenQuestionJson => ({
  text: question.text,
  subject: question.subject,
  label: question.label,
  date: question.date,
  skips: question.skips,
  factId: questionId(slug, question),
})

export const statementJson = (
  table: StatementTable,
  slug: string,
  statement: Statement,
  today: string,
): StatementJson => {
  const kind = table === 'declarados' ? 'stated' : 'report'
  return {
    text: statement.text,
    source: statement.source,
    date: statement.date,
    specific: statement.specific,
    reaction: statement.reaction,
    target: statement.target,
    label: statement.label,
    kind,
    strength: statedStrength(kind, statement.specific, statement.date, today),
    rating: statedRating(statement),
    ...editedOf(statement),
    factId: statementId(table, slug, statement),
  }
}

export const seenJson = (slug: string, seen: Seen): SeenJson => ({
  film: seen.target,
  title: seen.label,
  rating: seen.rating,
  date: seen.date,
  source: seen.source,
  ...editedOf(seen),
  factId: seenId(slug, seen),
})

// --- the write step ----------------------------------------------------------

/** Runs a Pessoa write through `DataWriter`: one commit with `message`,
 * the database's write connection, or null when there is no database
 * file. */
export const writePerson = <A, E, R>(
  by: WrittenBy,
  message: string,
  use: (db: Connection | null) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | PersonWriteError, R | DataWriter> =>
  Effect.flatMap(DataWriter, (writer) =>
    writer.writeFiles({ author: by.author ?? ENGINE_AUTHOR, message }, use),
  )

/** The database for a Catalog lookup; without one, `missing_database`. */
export const required = (
  db: Connection | null,
): Effect.Effect<Connection, EngineError, Environment> =>
  db !== null
    ? Effect.succeed(db)
    : Effect.flatMap(
        Effect.flatMap(Environment, (env) => env.path('database')),
        (path) => Effect.fail(missingDatabase(path)),
      )

/** Saves the Pessoa's file and syncs her rows (`_salvar`). */
export const savePersonAndSync = (
  db: Connection | null,
  person: Person,
): Effect.Effect<void, EngineError, Environment> =>
  Effect.andThen(savePerson(person), () =>
    db === null ? Effect.void : syncPerson(db, person),
  )

// --- arguments ---------------------------------------------------------------

export const invalidUsage = (message: string) =>
  engineError('invalid_usage', message)

/** The text as said, one space between words; never empty. */
export const textOf = (text: string) => {
  const words = pyJoinWords(text)
  return words === ''
    ? Effect.fail(invalidUsage('o texto não pode ser vazio'))
    : Effect.succeed(words)
}

/** Where it came from: never empty, never with the body's separator. */
export const sourceOf = (source: string) => {
  const words = pyJoinWords(source)
  return words === '' || words.includes(' · ')
    ? Effect.fail(invalidUsage("a fonte não pode ser vazia nem ter ' · '"))
    : Effect.succeed(words)
}

/** The date given (anything `date.fromisoformat` takes), or today. */
export const dateOf = (date: string | undefined) =>
  Effect.gen(function* () {
    if (date === undefined) return (yield* Run).today
    const iso = pyIsoDate(date)
    if (iso === null)
      return yield* invalidUsage(
        `data inválida: ${pyReprStr(date)} (use AAAA-MM-DD)`,
      )
    return iso
  })

// --- actions -----------------------------------------------------------------

export interface NewPersonInput extends WrittenBy, NewPerson {}

/** Creates the Pessoa's file (`pessoa criar`). */
export const personCreate = (
  input: NewPersonInput,
): Effect.Effect<PersonSummary, PersonWriteError, PersonServices> =>
  writePerson(input, `pessoa criar ${input.name}`, (db) =>
    Effect.gen(function* () {
      const person = yield* createPerson(input)
      if (db !== null) yield* syncPerson(db, person)
      return summary(person)
    }),
  )

const NO_DATABASE_WARNING =
  'banco não encontrado: as Notas aparecem depois de `reconstruir`'

/** Her Declarados that live outside her file: from a Letterboxd import or
 * a Feedback comment. */
export const importedStated = (db: Connection, slug: string, today: string) =>
  Effect.map(
    db.all(
      `SELECT fato_id, texto, fonte, data, especifico, reacao, alvo, rotulo FROM declarados
       WHERE pessoa = ? AND (fato_id LIKE 'letterboxd:%' OR sessao IS NOT NULL) ORDER BY data DESC, fato_id`,
      slug,
    ),
    (rows) =>
      rows.map((row): StatementJson => {
        const specific = Boolean(row.especifico)
        const date = String(row.data)
        return {
          text: String(row.texto),
          source: String(row.fonte),
          date,
          specific,
          reaction: reactionFromDb(row.reacao),
          target: row.alvo === null ? null : String(row.alvo),
          label: row.rotulo === null ? null : String(row.rotulo),
          kind: 'stated',
          strength: statedStrength('stated', specific, date, today),
          rating: null,
          factId: String(row.fato_id),
        }
      }),
  )

const ratingsOf = (db: Connection, slug: string) =>
  Effect.map(
    db.all(
      `SELECT n.filme_id, f.titulo, n.nota, n.data, n.fonte, n.tipo, n.fato_id
       FROM notas_vigentes n LEFT JOIN filmes f ON f.id = n.filme_id
       WHERE n.pessoa = ? ORDER BY n.data DESC, n.filme_id`,
      slug,
    ),
    (rows) =>
      rows.map((row): RatingJson => ({
        filmId: String(row.filme_id),
        title: row.titulo === null ? null : String(row.titulo),
        rating: Number(row.nota),
        date: String(row.data),
        source: String(row.fonte),
        kind: ratingKindFromDb(row.tipo),
        factId: String(row.fato_id),
      })),
  )

/** Everything the engine knows of the Pessoa (`pessoa ver`). */
export const personView = (
  name: string,
  options: { predictionError?: boolean; tasteAnalysis?: boolean } = {},
): Effect.Effect<
  PersonView,
  EngineError | SqliteError,
  Environment | Sqlite | Run
> =>
  Effect.gen(function* () {
    const person = yield* resolvePerson(name)
    const { today } = yield* Run
    const slug = person.slug
    const stated = (yield* items(person, 'stated')).map((s) =>
      statementJson('declarados', slug, s, today),
    )
    const reports = (yield* items(person, 'reports')).map((s) =>
      statementJson('relatos', slug, s, today),
    )
    const seen = (yield* items(person, 'seen')).map((s) => seenJson(slug, s))
    const view = {
      ...summary(person),
      vetoes: person.vetoes.map((v) => vetoJson(slug, v)),
      adjustments: person.adjustments.map((a) => adjustmentJson(slug, a)),
      stated,
      reports,
      seen,
      openQuestions: person.openQuestions.map((q) => openQuestionJson(slug, q)),
      imports: person.imports.map(yamlToJson),
    }
    const env = yield* Environment
    const path = yield* env.path('database')
    if (!(yield* Effect.sync(() => existsSync(path))))
      return { ...view, ratings: null, warning: NO_DATABASE_WARNING }
    return yield* (yield* Sqlite).read((db) =>
      Effect.gen(function* () {
        const imported = yield* importedStated(db, slug, today)
        const predictionError = options.predictionError
          ? yield* personPredictionError(db, path, slug, env.weights, today)
          : null
        const tasteAnalysis = options.tasteAnalysis
          ? yield* personTasteAnalysis(db, slug, env.weights)
          : null
        return {
          ...view,
          stated: [...stated, ...imported],
          ratings: yield* ratingsOf(db, slug),
          ...(predictionError !== null && { predictionError }),
          ...(tasteAnalysis !== null && { tasteAnalysis }),
        }
      }),
    )
  })

export interface StatementInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** What was said, as it was said. */
  readonly text: string
  /** A film (tt...) or a Catalog entity (Q...). */
  readonly target?: string
  /** How she feels about the target; about a film, love and hate become a
   * Nota 5 and 1. */
  readonly reaction?: StatementReaction
  /** Names a film, director, actor or subgenre; by default, unless the
   * target is only a genre (or there is none). */
  readonly specific?: boolean
  /** A review or tag she wrote herself (a Declarado only): specific. */
  readonly review?: boolean
  /** Where it came from. */
  readonly source?: string
  /** YYYY-MM-DD; today by default. */
  readonly date?: string
}

export interface StatedResult {
  readonly person: string
  readonly stated: StatementJson
  readonly new: boolean
}

export interface ReportResult {
  readonly person: string
  readonly report: StatementJson
  readonly new: boolean
}

/** The Declarado or Relato the input states, checked against its flags;
 * the label and `specific` come from the Catalog when it names a target. */
export const statementOf = (
  input: StatementInput,
  defaultSource: string,
  db: Connection | null,
) =>
  Effect.gen(function* () {
    const target = input.target || null
    const reaction = input.reaction ?? null
    if (reaction !== null && target === null)
      return yield* invalidUsage('--reacao precisa de --filme ou --entidade')
    if (input.review && input.specific === false)
      return yield* invalidUsage(
        'review ou tag da própria Pessoa é sempre específico',
      )
    const source = yield* sourceOf(input.source ?? defaultSource)
    let label: string | null = null
    let specific = input.specific
    if (target !== null) {
      const connection = yield* required(db)
      label = yield* targetLabel(connection, target)
      if (specific === undefined)
        specific = !(yield* onlyGenre(connection, target))
    }
    if (input.review) specific = true
    const statement: Statement = {
      date: yield* dateOf(input.date),
      source,
      specific: specific ?? false,
      text: yield* textOf(input.text),
      reaction,
      target,
      label,
    }
    return statement
  })

const recordStatement = (
  table: StatementTable,
  input: StatementInput,
  defaultSource: string,
) =>
  writePerson(
    input,
    `pessoa ${table === 'declarados' ? 'declarar' : 'relatar'} ${input.person}: ${input.text}`,
    (db) =>
      Effect.gen(function* () {
        const person = yield* resolvePerson(input.person)
        // The logged-in Dono speaks for herself; another Dono's taste can
        // come as a Relato. With no login, any Dono, as Python.
        const owner = yield* Owner
        const speaker = owner === null ? person.owner : person.slug === owner
        if (table === 'relatos' && speaker)
          return yield* invalidUsage(
            'o Dono falando do próprio gosto é Declarado, não Relato',
          )
        const statement = yield* statementOf(input, defaultSource, db)
        const section = table === 'declarados' ? 'stated' : 'reports'
        const { person: updated, added } = yield* addItem(
          person,
          section,
          statement,
        )
        if (added) yield* savePersonAndSync(db, updated)
        const { today } = yield* Run
        return {
          person: person.slug,
          json: statementJson(table, person.slug, statement, today),
          added,
        }
      }),
  )

/** Records a Declarado: what the Pessoa said of her own taste (`pessoa
 * declarar`). */
export const personState = (
  input: StatementInput,
): Effect.Effect<StatedResult, PersonWriteError, PersonServices> =>
  Effect.map(
    recordStatement('declarados', input, 'conversa com o Dono'),
    (r) => ({ person: r.person, stated: r.json, new: r.added }),
  )

/** Records a Relato: what the Dono knows of another Pessoa's taste
 * (`pessoa relatar`). Never a review. */
export const personReport = (
  input: Omit<StatementInput, 'review'>,
): Effect.Effect<ReportResult, PersonWriteError, PersonServices> =>
  Effect.map(
    recordStatement(
      'relatos',
      { ...input, review: false },
      'descrição do Dono',
    ),
    (r) => ({ person: r.person, report: r.json, new: r.added }),
  )

export interface SeenInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The film's Catalog id (tt...). */
  readonly film: string
  /** Her Nota: 0,5 to 5, or 1 to 10 written "8/10". */
  readonly rating?: string
  /** Where it came from. */
  readonly source?: string
  /** YYYY-MM-DD; today by default. */
  readonly date?: string
}

export interface SeenResult {
  readonly person: string
  readonly seen: SeenJson
  readonly new: boolean
}

/** Records that the Pessoa has seen the film, with her Nota when given
 * (`pessoa visto`). */
export const personSeen = (
  input: SeenInput,
): Effect.Effect<SeenResult, PersonWriteError, PersonServices> =>
  writePerson(input, `pessoa visto ${input.person}: ${input.film}`, (db) =>
    Effect.gen(function* () {
      const person = yield* resolvePerson(input.person)
      if (!input.film.startsWith('tt'))
        return yield* invalidUsage(
          `--filme precisa ser um ID de filme (tt...), não ${pyReprStr(input.film)}`,
        )
      const rating =
        input.rating === undefined
          ? null
          : (yield* readRating(input.rating)).rating
      const label = yield* targetLabel(yield* required(db), input.film)
      const seen: Seen = {
        date: yield* dateOf(input.date),
        source: yield* sourceOf(input.source ?? 'conversa com o Dono'),
        target: input.film,
        label,
        rating,
      }
      const { person: updated, added } = yield* addItem(person, 'seen', seen)
      if (added) yield* savePersonAndSync(db, updated)
      return {
        person: person.slug,
        seen: seenJson(person.slug, seen),
        new: added,
      }
    }),
  )
