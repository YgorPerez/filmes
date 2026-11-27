// `person edit` (#330): corrects a Declarado, a Relato, a Veto or a Já visto
// of the Pessoa's file in place, found by the fato_id `pessoa ver` shows or
// by its target when only one item has it. The item keeps its date and its
// line; it gets `editado <today>`, which the fato_id leaves out, so the
// fato_id changes only with what the item says.
//
// Only what came by a form is in her file: an imported item or a Feedback
// comment is not found, as in `pessoa remover`, and cannot be edited.

import { Effect } from 'effect'
import { pyReprStr } from '../compat/text.ts'
import { readRating } from '../data/rating.ts'
import { engineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import type { Connection } from '../sqlite/Sqlite.ts'
import {
  required,
  savePersonAndSync,
  seenJson,
  sourceOf,
  statementJson,
  statementOf,
  textOf,
  vetoJson,
  writePerson,
  type PersonServices,
  type PersonWriteError,
  type SeenJson,
  type StatementJson,
  type VetoJson,
  type WrittenBy,
} from './actions.ts'
import { targetLabel } from './facts.ts'
import { resolvePerson } from './people.ts'
import {
  items,
  replaceItem,
  type Person,
  type Seen,
  type Statement,
  type StatementReaction,
  type Veto,
} from './Person.ts'
import { tagGroupLabel } from './taste.ts'

/** What `person edit` corrects, by its option. */
export const EDITABLE = ['stated', 'report', 'veto', 'seen'] as const
export type Editable = (typeof EDITABLE)[number]

/** The option's Portuguese word, as the messages say it. */
const WORDS: Readonly<Record<Editable, string>> = {
  stated: 'declarado',
  report: 'relato',
  veto: 'veto',
  seen: 'visto',
}

export interface EditInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  readonly kind: Editable
  /** The fato_id, or the target (tt..., Q..., a group) if only one item of
   * the kind has it. */
  readonly id: string
  /** A field left out keeps what the item has; null clears it. */
  readonly text?: string
  /** A Declarado's, a Relato's or a Veto's: a film (tt...), an entity
   * (Q...) or, for a Veto, a tag group's key. A Já visto keeps its film. */
  readonly target?: string | null
  /** A Declarado's or a Relato's. */
  readonly reaction?: StatementReaction | null
  /** A Declarado's, a Relato's or a Já visto's. */
  readonly source?: string
  /** A Já visto's Nota: 0,5 to 5, or 1 to 10 written "8/10". */
  readonly rating?: string | null
}

export type EditedJson = StatementJson | VetoJson | SeenJson

export interface EditResult {
  readonly person: string
  readonly kind: Editable
  /** The item as it is now. */
  readonly edited: EditedJson
  /** The file changed: false when the edit said what the item said. */
  readonly changed: boolean
}

/** Every field but `edited` the same. */
const sameContent = <A extends object>(a: A, b: A): boolean => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  keys.delete('edited')
  return [...keys].every(
    (key) =>
      (a as Record<string, unknown>)[key] ===
      (b as Record<string, unknown>)[key],
  )
}

/** An item of her file, its JSON, its fato_id and how to build the edit. */
interface Entry<A> {
  readonly item: A
  readonly json: EditedJson
}

const notFound = (person: Person, kind: Editable, id: string) =>
  engineError(
    `unknown_${kind}`,
    `${person.slug} não tem ${WORDS[kind]} com fato_id ou alvo ${pyReprStr(id)} no arquivo; ` +
      'o que veio de um import ou do Feedback não se edita aqui',
  )

/** The one entry the id names: its fato_id, else its target. */
const pick = <A>(
  person: Person,
  kind: Editable,
  id: string,
  entries: readonly Entry<A>[],
  targetOf: (item: A) => string | null,
) => {
  let found = entries.filter((e) => e.json.factId === id)
  if (found.length === 0) found = entries.filter((e) => targetOf(e.item) === id)
  const [first] = found
  if (first === undefined) return Effect.fail(notFound(person, kind, id))
  if (found.length > 1)
    return Effect.fail(
      engineError(
        `ambiguous_${kind}`,
        `mais de um ${WORDS[kind]} de ${person.slug} tem o alvo ${id}; ` +
          `escolha pelo fato_id: ${found.map((f) => f.json.factId).join(', ')}`,
      ),
    )
  return Effect.succeed(first)
}

const duplicate = (person: Person, kind: Editable) =>
  engineError(
    'invalid_usage',
    `${person.slug} já tem um ${WORDS[kind]} igual a este depois da edição`,
    'duplicate_item',
  )

/** A Veto's target label: a tag group's, or the Catalog's. */
const vetoLabel = (db: Connection | null, target: string) =>
  /^(?:tt|Q)\d/.test(target)
    ? Effect.flatMap(required(db), (connection) =>
        targetLabel(connection, target),
      )
    : tagGroupLabel(target)

/** The edit of a Declarado or a Relato. */
const editStatement = (
  person: Person,
  input: EditInput,
  db: Connection | null,
  today: string,
) =>
  Effect.gen(function* () {
    const table = input.kind === 'stated' ? 'declarados' : 'relatos'
    const section = input.kind === 'stated' ? 'stated' : 'reports'
    const list = yield* items(person, section)
    const json = (s: Statement) => statementJson(table, person.slug, s, today)
    const entries = list.map((item) => ({ item, json: json(item) }))
    const { item } = yield* pick(
      person,
      input.kind,
      input.id,
      entries,
      (s) => s.target,
    )
    const target =
      input.target === undefined ? item.target : input.target || null
    const reaction =
      input.reaction === undefined
        ? target === null
          ? null
          : item.reaction
        : input.reaction
    const built = yield* statementOf(
      {
        person: person.slug,
        text: input.text ?? item.text,
        ...(target === null ? {} : { target }),
        ...(reaction === null ? {} : { reaction }),
        // The target decides it again only when it changed.
        ...(target === item.target ? { specific: item.specific } : {}),
        source: input.source ?? item.source,
        date: item.date,
      },
      item.source,
      db,
    )
    const next: Statement = { ...built, edited: today }
    if (sameContent(next, item))
      return { json: json(item), changed: false, person }
    const id = json(next).factId
    if (entries.some((e) => e.item !== item && e.json.factId === id))
      return yield* duplicate(person, input.kind)
    return {
      json: json(next),
      changed: true,
      person: yield* replaceItem(person, section, item, next),
    }
  })

/** The edit of a Veto. */
const editVeto = (
  person: Person,
  input: EditInput,
  db: Connection | null,
  today: string,
) =>
  Effect.gen(function* () {
    const entries = person.vetoes.map((item) => ({
      item,
      json: vetoJson(person.slug, item),
    }))
    const { item } = yield* pick(
      person,
      'veto',
      input.id,
      entries,
      (v) => v.target,
    )
    const target = input.target ?? item.target
    const next: Veto = {
      text: input.text === undefined ? item.text : yield* textOf(input.text),
      target,
      label: target === item.target ? item.label : yield* vetoLabel(db, target),
      date: item.date,
      edited: today,
    }
    if (sameContent(next, item))
      return { json: vetoJson(person.slug, item), changed: false, person }
    // One Veto per target.
    if (person.vetoes.some((v) => v !== item && v.target === target))
      return yield* duplicate(person, 'veto')
    return {
      json: vetoJson(person.slug, next),
      changed: true,
      person: yield* replaceItem(person, 'vetoes', item, next),
    }
  })

/** The edit of a Já visto: its Nota and its Fonte; the film stays. */
const editSeen = (person: Person, input: EditInput, today: string) =>
  Effect.gen(function* () {
    const list = yield* items(person, 'seen')
    const entries = list.map((item) => ({
      item,
      json: seenJson(person.slug, item),
    }))
    const { item } = yield* pick(
      person,
      'seen',
      input.id,
      entries,
      (s) => s.target,
    )
    if (input.target != null && input.target !== item.target)
      return yield* engineError(
        'invalid_usage',
        'o filme de um Já visto não muda: tire este e acrescente o outro',
      )
    const rating =
      input.rating === undefined
        ? item.rating
        : input.rating === null
          ? null
          : (yield* readRating(input.rating)).rating
    const { pairwise: _pairwise, edited: _edited, ...rest } = item
    const next: Seen = {
      ...rest,
      source:
        input.source === undefined
          ? item.source
          : yield* sourceOf(input.source),
      rating,
      // A Nota given here is no longer the pairwise answer's.
      ...(item.pairwise === true && rating === item.rating
        ? { pairwise: true }
        : {}),
      edited: today,
    }
    if (sameContent(next, item))
      return { json: seenJson(person.slug, item), changed: false, person }
    const id = seenJson(person.slug, next).factId
    if (entries.some((e) => e.item !== item && e.json.factId === id))
      return yield* duplicate(person, 'seen')
    return {
      json: seenJson(person.slug, next),
      changed: true,
      person: yield* replaceItem(person, 'seen', item, next),
    }
  })

const edit = (
  person: Person,
  input: EditInput,
  db: Connection | null,
  today: string,
): Effect.Effect<
  { json: EditedJson; changed: boolean; person: Person },
  PersonWriteError,
  PersonServices
> => {
  switch (input.kind) {
    case 'stated':
    case 'report':
      return editStatement(person, input, db, today)
    case 'veto':
      return editVeto(person, input, db, today)
    case 'seen':
      return editSeen(person, input, today)
  }
}

/** Corrects the item in her file and the database (`person edit`). An
 * edit that says what the item said writes nothing. */
export const personEdit = (
  input: EditInput,
): Effect.Effect<EditResult, PersonWriteError, PersonServices> =>
  writePerson(
    input,
    `pessoa editar ${input.person}: ${WORDS[input.kind]} ${input.id}`,
    (db) =>
      Effect.gen(function* () {
        const person = yield* resolvePerson(input.person)
        const { today } = yield* Run
        const done = yield* edit(person, input, db, today)
        if (done.changed) yield* savePersonAndSync(db, done.person)
        return {
          person: person.slug,
          kind: input.kind,
          edited: done.json,
          changed: done.changed,
        }
      }),
  )
