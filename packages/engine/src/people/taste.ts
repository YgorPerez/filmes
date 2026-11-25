// The `pessoa` actions on what a Pessoa never wants and how much a link
// weighs for her (`filmes/comandos/pessoa.py`): `vetar`, `ajustar`, `pular`
// and `perguntas`. Writes go through `writePerson` (see `actions.ts`).

import { Effect } from 'effect'
import { pyReprStr } from '../compat/text.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { isTagGroup, readTagGroups } from '../recommendation/vetoes.ts'
import {
  adjustmentJson,
  dateOf,
  invalidUsage,
  openQuestionJson,
  required,
  savePersonAndSync,
  textOf,
  vetoJson,
  writePerson,
  type AdjustmentJson,
  type OpenQuestionJson,
  type PersonServices,
  type PersonWriteError,
  type VetoJson,
  type WrittenBy,
} from './actions.ts'
import { targetLabel } from './facts.ts'
import { resolvePerson } from './people.ts'
import {
  addItem,
  removeItem,
  skipQuestion,
  type Adjustment,
  type OpenQuestion,
  type Veto,
} from './Person.ts'
import type { Level, Link } from '../evidence/strength.ts'

/** The tag group's label; a key that is not a group is `unknown_target`
 * (`_rotulo_do_grupo`). The message names the English file and keys the
 * engine reads, where Python named its Portuguese file and keys. */
export const tagGroupLabel = (
  key: string,
): Effect.Effect<string, EngineError, Environment> =>
  Effect.flatMap(readTagGroups, (groups) => {
    const group = groups.get(key)
    if (group === undefined || !isTagGroup(key)) {
      const keys = [...groups.keys()].join(', ') || 'nenhum'
      return Effect.fail(
        engineError(
          'unknown_target',
          `'${key}' não é um grupo de config/tag_vetoes.toml (há: ${keys})`,
        ),
      )
    }
    return Effect.succeed(group.label)
  })

// --- vetar -------------------------------------------------------------------

export interface VetoInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The Veto as it was said: "nunca vê terror". */
  readonly text: string
  /** A film (tt...), an entity (Q...) or, with `group`, a tag group's key. */
  readonly target: string
  /** The target is a tag group of `tag_vetoes.toml` (`silly_comedy`). */
  readonly group?: boolean
  /** YYYY-MM-DD; today by default. */
  readonly date?: string
}

export interface VetoResult {
  readonly person: string
  readonly veto: VetoJson
  readonly new: boolean
}

/** Records a Veto: the Pessoa never sees films of the target (`pessoa
 * vetar`). One Veto per target: the same target again keeps the first. */
export const personVeto = (
  input: VetoInput,
): Effect.Effect<VetoResult, PersonWriteError, PersonServices> =>
  writePerson(input, `pessoa vetar ${input.person}: ${input.target}`, (db) =>
    Effect.gen(function* () {
      const person = yield* resolvePerson(input.person)
      const label = input.group
        ? yield* tagGroupLabel(input.target)
        : yield* targetLabel(yield* required(db), input.target)
      const veto: Veto = {
        text: yield* textOf(input.text),
        target: input.target,
        label,
        date: yield* dateOf(input.date),
      }
      const { person: updated, added } = yield* addItem(person, 'vetoes', veto)
      if (added) yield* savePersonAndSync(db, updated)
      const kept = added
        ? veto
        : (person.vetoes.find((v) => v.target === input.target) ?? veto)
      return {
        person: person.slug,
        veto: vetoJson(person.slug, kept),
        new: added,
      }
    }),
  )

// --- ajustar -----------------------------------------------------------------

export interface AdjustInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  readonly link: Link
  /** `none` drops the link's Evidence, `low` halves it and lowers its Força,
   * `high` weighs 1.5; `normal` removes the Ajuste. */
  readonly level: Level
  /** YYYY-MM-DD; today by default. */
  readonly date?: string
}

/** An Ajuste set back to normal: no date, no fato_id. */
export interface NormalAdjustmentJson {
  readonly link: Link
  readonly level: 'normal'
}

export interface AdjustResult {
  readonly person: string
  readonly adjustment: AdjustmentJson | NormalAdjustmentJson
  /** The file changed. */
  readonly new: boolean
}

/** Records an Ajuste: how much a link weighs for the Pessoa (`pessoa
 * ajustar`). One per link: a new level replaces the old one. */
export const personAdjust = (
  input: AdjustInput,
): Effect.Effect<AdjustResult, PersonWriteError, PersonServices> =>
  writePerson(
    input,
    `pessoa ajustar ${input.person}: ${input.link} ${input.level}`,
    (db) =>
      Effect.gen(function* () {
        const person = yield* resolvePerson(input.person)
        const slug = person.slug
        const previous = person.adjustments.find((a) => a.link === input.link)
        if (input.level === 'normal') {
          if (previous !== undefined)
            yield* savePersonAndSync(
              db,
              yield* removeItem(person, 'adjustments', previous),
            )
          return {
            person: slug,
            adjustment: { link: input.link, level: 'normal' as const },
            new: previous !== undefined,
          }
        }
        const adjustment: Adjustment = {
          link: input.link,
          level: input.level,
          date: yield* dateOf(input.date),
        }
        if (previous !== undefined && previous.level === adjustment.level)
          return {
            person: slug,
            adjustment: adjustmentJson(slug, previous),
            new: false,
          }
        const { person: updated } = yield* addItem(
          person,
          'adjustments',
          adjustment,
        )
        yield* savePersonAndSync(db, updated)
        return {
          person: slug,
          adjustment: adjustmentJson(slug, adjustment),
          new: true,
        }
      }),
  )

// --- pular -------------------------------------------------------------------

export interface SkipInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The question as it was asked. */
  readonly text: string
  /** Its subject: a Catalog entity (Q...) or, with `group`, a tag group's
   * key. */
  readonly subject?: string
  readonly group?: boolean
  /** YYYY-MM-DD; today by default. */
  readonly date?: string
}

export interface SkipResult {
  readonly person: string
  readonly openQuestion: OpenQuestionJson
  /** Skipped for the second time: it left the list. */
  readonly dropped: boolean
}

/** Keeps a taste question the Pessoa skipped; skipped again, it leaves
 * (`pessoa pular`). */
export const personSkip = (
  input: SkipInput,
): Effect.Effect<SkipResult, PersonWriteError, PersonServices> =>
  writePerson(input, `pessoa pular ${input.person}: ${input.text}`, (db) =>
    Effect.gen(function* () {
      const person = yield* resolvePerson(input.person)
      const subject = input.subject || null
      let label: string | null = null
      if (input.group && input.subject)
        label = yield* tagGroupLabel(input.subject)
      else if (input.subject) {
        if (input.subject.startsWith('tt'))
          return yield* invalidUsage(
            `o assunto é uma entidade (Q...) ou um grupo, não um filme: ${pyReprStr(input.subject)}`,
          )
        label = yield* targetLabel(yield* required(db), input.subject)
      }
      const asked: OpenQuestion = {
        text: yield* textOf(input.text),
        date: yield* dateOf(input.date),
        skips: 1,
        subject,
        label,
      }
      const skipped = skipQuestion(person, asked)
      yield* savePersonAndSync(db, skipped.person)
      return {
        person: person.slug,
        openQuestion: openQuestionJson(person.slug, skipped.question),
        dropped: skipped.dropped,
      }
    }),
  )

// --- perguntas ---------------------------------------------------------------

export interface QuestionsResult {
  readonly person: string
  readonly openQuestions: readonly OpenQuestionJson[]
}

/** The taste questions the Pessoa skipped that are still open (`pessoa
 * perguntas`). */
export const personQuestions = (
  name: string,
): Effect.Effect<QuestionsResult, EngineError, Environment> =>
  Effect.map(resolvePerson(name), (person) => ({
    person: person.slug,
    openQuestions: person.openQuestions.map((q) =>
      openQuestionJson(person.slug, q),
    ),
  }))
