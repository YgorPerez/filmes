// A Pessoa [Person] as her file `people/<slug>.md` holds her
// (`filmes/dados/pessoas.py`). The frontmatter has her name, aliases,
// `owner: true` on a Dono, `email` and `admin` for the online login, her
// Vetos, Ajustes, open questions, imports and the setup guide's skipped
// steps; no age is kept. The body has
// the sections `## Declarados` (what she said of her own taste) and
// `## Relatos` (what the Dono told of her), one item per line:
//
//     - 2026-11-20 · questionário · específico · gosta de Sofia Rangel (Q9000018) · "adoro os filmes dela"
//     - 2026-11-20 · descrição do Dono · genérico · "odeia filme lento"
//
// that is: date, Fonte, específico or genérico, the reaction to the target
// (ama, gosta de, não gosta de, odeia, or just "sobre") with its id in
// parentheses, and what was said. The target is optional. `## Já vistos`
// keeps what she said she has seen, with her Nota (0,5 to 5) when she gave
// one:
//
//     - 2026-11-21 · conversa com o Dono · Casa Cheia (tt9000602) · nota 4
//
// A Nota from an answer to the Perguntas par a par ends with `· par a par`,
// whatever its Fonte says: the ruler keeps it weak and her scale leaves it
// out.
//
// The body stays in Portuguese (ADR 0002); the rest
// of it is free text and is kept as written.
//
// `SECTIONS` says where each kind of item lives: Vetos, Ajustes and open
// questions in the frontmatter, the rest in a body section. `items`,
// `addItem` and `removeItem` go through it.

import { Effect } from 'effect'
import { pyFormatG } from '../compat/number.ts'
import { isIsoDate, pyParseFloat } from '../compat/parse.ts'
import { pythonError } from '../compat/python-error.ts'
import {
  casefold,
  PY_SPACE_CLASS,
  pyRstrip,
  pySplitlines,
  pyStrip,
} from '../compat/text.ts'
import type { Level, Link } from '../evidence/strength.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { YamlValue } from '../data/yaml.ts'

/** An Ajuste's elo [link], in the order of the file's error message. */
export const LINKS = [
  'director',
  'writer',
  'cast',
  'series',
  'genre',
] as const satisfies readonly Link[]

/** An Ajuste's nível [level]; `normal` is never written to the file. */
export const LEVELS = [
  'none',
  'low',
  'normal',
  'high',
] as const satisfies readonly Level[]

/** How a Declarado or a Relato feels about its target. */
export const STATEMENT_REACTIONS = ['love', 'like', 'dislike', 'hate'] as const
export type StatementReaction = (typeof STATEMENT_REACTIONS)[number]

/** A step of the Guia de início [setup guide] of the home (#143), in the
 * order the home shows them. */
export const SETUP_STEPS = ['taste', 'import', 'connector'] as const
export type SetupStep = (typeof SETUP_STEPS)[number]

/** Skipped this many times, an open question leaves the list. */
export const SKIPS_TO_DROP = 2

export interface Veto {
  readonly text: string
  /** A film (tt...), an entity (Q...) or a tag group. */
  readonly target: string
  readonly label: string
  readonly date: string
}

export interface Adjustment {
  readonly link: Link
  readonly level: Exclude<Level, 'normal'>
  readonly date: string
}

export interface OpenQuestion {
  readonly text: string
  /** The last time it was skipped. */
  readonly date: string
  readonly skips: number
  /** An entity (Q...) or a tag group. */
  readonly subject: string | null
  readonly label: string | null
}

/** A Declarado [stated] or a Relato [report]: a line of the body. */
export interface Statement {
  readonly date: string
  readonly source: string
  readonly specific: boolean
  readonly text: string
  readonly reaction: StatementReaction | null
  /** A film (tt...) or an entity (Q...). */
  readonly target: string | null
  readonly label: string | null
}

/** A Já visto [seen] said on the spot, with the Nota when she gave one: a
 * line of `## Já vistos`. */
export interface Seen {
  readonly date: string
  readonly source: string
  /** A film (tt...). */
  readonly target: string
  readonly label: string
  /** On the scale of 0,5 to 5. */
  readonly rating: number | null
  /** The Nota came from an answer to the Perguntas par a par (#181). */
  readonly pairwise?: boolean
}

export interface Person {
  /** The file name without `.md`. */
  readonly slug: string
  readonly name: string
  readonly aliases: readonly string[]
  readonly owner: boolean
  /** For the online login (map #72): the engine only keeps it on rewrite. */
  readonly email: string | null
  readonly admin: boolean
  readonly vetoes: readonly Veto[]
  readonly adjustments: readonly Adjustment[]
  readonly openQuestions: readonly OpenQuestion[]
  /** The imports' records, as read: the import tickets give them a type. */
  readonly imports: readonly YamlValue[]
  /** The setup guide's steps she skipped (`skipped_setup:`), in the order
   * she skipped them. */
  readonly skippedSetup: readonly SetupStep[]
  readonly body: string
}

/** The same open question: the same subject when both have one; otherwise
 * the same text, ignoring case. */
export const sameQuestion = (a: OpenQuestion, b: OpenQuestion): boolean =>
  a.subject && b.subject
    ? a.subject === b.subject
    : casefold(a.text) === casefold(b.text)

/** Python's `==` on the frozen dataclasses: every field equal. */
const equal = <A extends object>(a: A, b: A): boolean =>
  (Object.keys(a) as Array<keyof A>).every((key) => a[key] === b[key]) &&
  Object.keys(a).length === Object.keys(b).length

// --- body lines ----------------------------------------------------------

/** The words of a reaction in the body, which stays Portuguese. */
const REACTION_WORDS: Readonly<Record<StatementReaction, string>> = {
  love: 'ama',
  like: 'gosta de',
  dislike: 'não gosta de',
  hate: 'odeia',
}

const REACTION_BY_WORDS: ReadonlyMap<string, StatementReaction | null> =
  new Map([
    ...Object.entries(REACTION_WORDS).map(
      ([reaction, words]) => [words, reaction as StatementReaction] as const,
    ),
    ['sobre', null],
  ])

const NOT_SPACE_OR_PARENS = `[^()${PY_SPACE_CLASS}]`

const STATEMENT_LINE = new RegExp(
  '^- (?<date>[0-9]{4}-[0-9]{2}-[0-9]{2}) · (?<source>.+?) · (?<specificity>específico|genérico)' +
    `(?: · (?<reaction>ama|gosta de|não gosta de|odeia|sobre) (?<label>.+?) \\((?<target>${NOT_SPACE_OR_PARENS}+)\\))?` +
    ' · "(?<text>.*)"$',
  'u',
)

const SEEN_LINE = new RegExp(
  `^- (?<date>[0-9]{4}-[0-9]{2}-[0-9]{2}) · (?<source>.+?) · (?<label>.+?) \\((?<target>tt${NOT_SPACE_OR_PARENS}+)\\)` +
    '(?: · nota (?<rating>\\p{Nd}+(?:,\\p{Nd}+)?)(?<pairwise> · par a par)?)?$',
  'u',
)

/** The body line of a Declarado or a Relato. */
export const statementLine = (s: Statement): string => {
  const fields = [s.date, s.source, s.specific ? 'específico' : 'genérico']
  if (s.target) {
    const words = s.reaction ? REACTION_WORDS[s.reaction] : 'sobre'
    fields.push(`${words} ${s.label} (${s.target})`)
  }
  fields.push(`"${s.text}"`)
  return `- ${fields.join(' · ')}`
}

/** The end of a pairwise answer's Nota line. */
const PAIRWISE_MARK = 'par a par'

/** The body line of a Já visto. */
export const seenLine = (s: Seen): string => {
  const fields = [s.date, s.source, `${s.label} (${s.target})`]
  if (s.rating !== null)
    fields.push(`nota ${pyFormatG(s.rating).replace('.', ',')}`)
  if (s.rating !== null && s.pairwise === true) fields.push(PAIRWISE_MARK)
  return `- ${fields.join(' · ')}`
}

type Groups = Readonly<Record<string, string | undefined>>

const statement = (g: Groups): Statement => ({
  date: g.date ?? '',
  source: g.source ?? '',
  specific: g.specificity === 'específico',
  text: g.text ?? '',
  reaction:
    g.reaction === undefined
      ? null
      : (REACTION_BY_WORDS.get(g.reaction) ?? null),
  target: g.target ?? null,
  label: g.label ?? null,
})

const seen = (g: Groups): Seen => ({
  date: g.date ?? '',
  source: g.source ?? '',
  target: g.target ?? '',
  label: g.label ?? '',
  rating:
    g.rating === undefined ? null : pyParseFloat(g.rating.replace(',', '.')),
  ...(g.pairwise === undefined ? {} : { pairwise: true }),
})

// --- sections --------------------------------------------------------------

interface SectionItems {
  readonly vetoes: Veto
  readonly adjustments: Adjustment
  readonly open_questions: OpenQuestion
  readonly stated: Statement
  readonly reports: Statement
  readonly seen: Seen
}

/** Where a kind of item lives in the file. */
export type Section = keyof SectionItems
export type SectionItem<S extends Section> = SectionItems[S]

interface SectionRules<A> {
  readonly read: (person: Person) => Effect.Effect<readonly A[], EngineError>
  /** The person with the item, or null when it was already there. */
  readonly add: (
    person: Person,
    item: A,
  ) => Effect.Effect<Person | null, EngineError>
  readonly remove: (
    person: Person,
    item: A,
  ) => Effect.Effect<Person, EngineError>
}

const notFound = () =>
  Effect.die(pythonError('ValueError', 'list.remove(x): x not in list'))

/** Removes the first item equal to `item`, as `list.remove`. */
const without = <A extends object>(
  items: readonly A[],
  item: A,
): Effect.Effect<A[]> => {
  const index = items.findIndex((other) => equal(other, item))
  if (index === -1) return notFound()
  return Effect.succeed(items.filter((_, i) => i !== index))
}

const vetoes: SectionRules<Veto> = {
  read: (person) => Effect.succeed(person.vetoes),
  // One per target.
  add: (person, veto) =>
    Effect.succeed(
      person.vetoes.some((v) => v.target === veto.target)
        ? null
        : { ...person, vetoes: [...person.vetoes, veto] },
    ),
  remove: (person, veto) =>
    Effect.map(without(person.vetoes, veto), (rest) => ({
      ...person,
      vetoes: rest,
    })),
}

const adjustments: SectionRules<Adjustment> = {
  read: (person) => Effect.succeed(person.adjustments),
  // One per link: the new one replaces the old.
  add: (person, adjustment) =>
    Effect.succeed(
      person.adjustments.some((a) => equal(a, adjustment))
        ? null
        : {
            ...person,
            adjustments: [
              ...person.adjustments.filter((a) => a.link !== adjustment.link),
              adjustment,
            ],
          },
    ),
  remove: (person, adjustment) =>
    Effect.map(without(person.adjustments, adjustment), (rest) => ({
      ...person,
      adjustments: rest,
    })),
}

const openQuestions: SectionRules<OpenQuestion> = {
  read: (person) => Effect.succeed(person.openQuestions),
  // One per subject (or per text, without one).
  add: (person, question) =>
    Effect.succeed(
      person.openQuestions.some((q) => sameQuestion(q, question))
        ? null
        : { ...person, openQuestions: [...person.openQuestions, question] },
    ),
  remove: (person, question) =>
    Effect.map(without(person.openQuestions, question), (rest) => ({
      ...person,
      openQuestions: rest,
    })),
}

/** A `## <title>` section of the body, one item per line in its format. */
const bodySection = <A extends object>(
  title: string,
  format: RegExp,
  item: (groups: Groups) => A,
  line: (item: A) => string,
): SectionRules<A> => {
  const heading = casefold(title)
  /** [line index, item] of each line of the section; a line out of format
   * fails naming the file and the line. */
  const indexed = (
    person: Person,
  ): Effect.Effect<ReadonlyArray<readonly [number, A]>, EngineError> =>
    Effect.suspend(() => {
      const found: Array<readonly [number, A]> = []
      let current: string | null = null
      const lines = pySplitlines(person.body)
      for (const [i, text] of lines.entries()) {
        if (text.startsWith('#')) {
          current = casefold(pyStrip(text.replace(/^#+/, '')))
          continue
        }
        if (current !== heading || !text.startsWith('- ')) continue
        const match = format.exec(pyRstrip(text))
        if (!match?.groups || !isIsoDate(match.groups.date ?? ''))
          return Effect.fail(
            engineError(
              'invalid_data',
              `people/${person.slug}.md, linha ${i + 1} do corpo: ${title.slice(0, -1)} fora do formato: ${text}`,
            ),
          )
        found.push([i, item(match.groups)])
      }
      return Effect.succeed(found)
    })

  const read = (person: Person) =>
    Effect.map(indexed(person), (found) => found.map(([, it]) => it))

  return {
    read,
    add: (person, added) =>
      Effect.map(read(person), (present) => {
        if (present.some((it) => equal(it, added))) return null
        const lines = pySplitlines(person.body)
        const titleLine = `## ${title}`
        if (!lines.includes(titleLine)) {
          while (lines.length > 0 && pyStrip(lines.at(-1) ?? '') === '')
            lines.pop()
          lines.push(
            ...(lines.length > 0 ? [''] : []),
            titleLine,
            '',
            line(added),
          )
        } else {
          const start = lines.indexOf(titleLine) + 1
          let end = lines.findIndex((l, i) => i >= start && l.startsWith('#'))
          if (end === -1) end = lines.length
          let last = start
          for (let i = start; i < end; i++)
            if (pyStrip(lines[i] ?? '') !== '') last = i
          lines.splice(last + 1, 0, line(added))
        }
        return { ...person, body: `${lines.join('\n')}\n` }
      }),
    remove: (person, removed) =>
      Effect.flatMap(indexed(person), (found) => {
        const at = found.find(([, it]) => equal(it, removed))
        if (!at)
          return Effect.die(pythonError('ValueError', 'item not in section'))
        const lines = pySplitlines(person.body)
        lines.splice(at[0], 1)
        return Effect.succeed({ ...person, body: `${lines.join('\n')}\n` })
      }),
  }
}

const SECTIONS: { readonly [S in Section]: SectionRules<SectionItems[S]> } = {
  vetoes,
  adjustments,
  open_questions: openQuestions,
  stated: bodySection('Declarados', STATEMENT_LINE, statement, statementLine),
  reports: bodySection('Relatos', STATEMENT_LINE, statement, statementLine),
  seen: bodySection('Já vistos', SEEN_LINE, seen, seenLine),
}

/** The items of a section. A body line out of format is `invalid_data`. */
export const items = <S extends Section>(
  person: Person,
  section: S,
): Effect.Effect<readonly SectionItems[S][], EngineError> =>
  SECTIONS[section].read(person)

/** The person with the item in the section (a missing body section is
 * created at the end), and whether it was not there yet. */
export const addItem = <S extends Section>(
  person: Person,
  section: S,
  item: SectionItems[S],
): Effect.Effect<
  { readonly person: Person; readonly added: boolean },
  EngineError
> =>
  Effect.map(SECTIONS[section].add(person, item), (updated) => ({
    person: updated ?? person,
    added: updated !== null,
  }))

/** The person without the item. A body section stays, even empty. An item
 * that is not there is a defect, as in Python. */
export const removeItem = <S extends Section>(
  person: Person,
  section: S,
  item: SectionItems[S],
): Effect.Effect<Person, EngineError> => SECTIONS[section].remove(person, item)

/** Keeps a skipped question, counting the skip when it was already open
 * (`pessoas.pular`): the question with its new count, and whether it left
 * the list (skipped for the second time). */
export const skipQuestion = (
  person: Person,
  question: OpenQuestion,
): {
  readonly person: Person
  readonly question: OpenQuestion
  readonly dropped: boolean
} => {
  const index = person.openQuestions.findIndex((q) => sameQuestion(q, question))
  const previous = person.openQuestions[index]
  if (previous === undefined)
    return {
      person: { ...person, openQuestions: [...person.openQuestions, question] },
      question,
      dropped: false,
    }
  // The subject comes from either: it may have been skipped without one.
  const [subject, label] = previous.subject
    ? [previous.subject, previous.label]
    : [question.subject, question.label]
  const current: OpenQuestion = {
    text: previous.text,
    date: question.date,
    skips: previous.skips + 1,
    subject,
    label,
  }
  const dropped = current.skips >= SKIPS_TO_DROP
  const openQuestions = dropped
    ? person.openQuestions.filter((_, i) => i !== index)
    : person.openQuestions.map((q, i) => (i === index ? current : q))
  return { person: { ...person, openQuestions }, question: current, dropped }
}
