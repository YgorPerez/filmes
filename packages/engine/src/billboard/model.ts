// The Cartaz [billboard] of a Session (`cartaz/__init__.py`), as data: what
// the React Cartaz (#114) and the MCP Apps view (#111) render, with no HTML.
//
// Once the Session has its Feedback, the chosen film carries each
// Presente's Nota prevista as the version stored it, next to her Reação
// (#264): what was expected beside what came. A chosen film with no card
// (outside the Recomendação, or left out of the films shown) has a block
// of its own, `chosen`.
//
// Every text the page shows comes from here: the reading of the request at
// the top, the line of what left the previous version and why, each film's
// header and, in "Por que cada um vai gostar", the strongest Evidence of
// each Presente. Presentes with the same Evidence share a line; who has no
// Fato is on a line of her own, with no Força.
//
// The Evidence comes from the Session's body. The header (genres, rating,
// poster, Portuguese title, synopsis) is rebuilt from the database and the
// TMDB, which answers from the cache; so is the trailer (#289), a YouTube
// link only when TMDB has one. The sources' attributions stay out, as in
// the Markdown answer (the Dono's decision of 2026-11-21).
//
// In a version redone with `keep` (#59), a film that came in is `new`, and
// `dropped` says what left and why ("Teo não viu Cais 2" for the Série na
// ordem, #165). While the similar holds in the Session (#68), the top reads
// "parecidos com X", and a Série na ordem out of its default mode says the
// mode; a stored Restrição that no longer exists (the legacy no_repeat) is
// left out.
//
// The Cartaz also carries the Climas the version asked and the whole
// vocabulary, in the file's order: the chips the Dono toggles to ask for
// another Clima (#179), which the text's `clima:` line takes back.
//
// The films go in sections by Motivo [reason] (#183): neighbouring films
// with the same Motivo share a title ("Porque você gosta de Helena Prado"),
// and the Aposta has its own. The order and the number of films do not
// change, so a Motivo that comes back after another opens a section again,
// marked `again`. The Motivo is the one the Session file kept for each film
// when the Recomendação was made; a Session from before has no sections.
//
// With `shown` (IMDb ids), the Cartaz has only those films of the
// Recomendação, in that order and numbered from 1: the list the Dono sees.
// `billboard` then records them in `shown` (`sessao.mostrar`).

import { Effect } from 'effect'
import { pyFixed, pyRepr, pyRound } from '../compat/number.ts'
import { casefold, pyStrip } from '../compat/text.ts'
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
import type { Strength } from '../evidence/strength.ts'
import { listText } from '../evidence/wording.ts'
import { CAUTIOUS_BET_REASON } from '../recommendation/bet.ts'
import { catalogFilm } from '../recommendation/candidates.ts'
import type { StoredConstraint } from '../recommendation/constraints.ts'
import { askedConstraintLabel } from '../recommendation/constraints/index.ts'
import {
  unseenText,
  type UnseenBefore,
} from '../recommendation/constraints/series-order.ts'
import { filmHeader } from '../recommendation/header.ts'
import { readMoods } from '../recommendation/moods.ts'
import type { DropCause } from '../recommendation/kept.ts'
import type { FilmReason, ReasonKind } from '../recommendation/reason.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Owner } from '../runtime/Owner.ts'
import { Run } from '../runtime/Run.ts'
import { Tmdb } from '../sources/Tmdb.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { pyInt } from '../compat/fact-id.ts'
import { sessionOwner } from '../sessions/feedback.ts'
import {
  readableReactions,
  type Reaction,
  type ReportLevel,
} from '../sessions/facts.ts'
import { formatRating } from '../data/rating.ts'
import {
  currentVersion,
  filmsInBody,
  isCautiousBet,
  isOpen,
  readSession,
  sessionDuration,
  writeSession,
  type BodyEvidence,
  type FilmInBody,
} from '../sessions/file.ts'
import { authorFor } from '../sessions/open.ts'

/** The person colours of the design (`person-1` to `person-6`), by the
 * Presente's order. */
export const PERSON_COLORS = 6

/** A Presente, as the Cartaz shows her. */
export interface BillboardPerson {
  readonly slug: string
  readonly name: string
  /** "Você" for the Dono, else her name. */
  readonly label: string
  /** The shortest start of her name no other Presente's starts with
   * ("Léo" and "Lopo" are "Lé" and "Lo"). */
  readonly initial: string
  /** 1 to `PERSON_COLORS`. */
  readonly color: number
  readonly owner: boolean
}

/** The reading of the request, at the top. */
export interface BillboardRequest {
  /** What the Dono typed or said, if anything. */
  readonly speech: string | null
  /** "Você", "Iara", "Vocês dois"... */
  readonly who: string
  /** What follows `who`, joined by " · " on the page: the maximum
   * duration, the minimum IMDb rating, the Climas, the Restrições' labels
   * and the Regra. */
  readonly parts: ReadonlyArray<string>
  /** "Só filmes que ninguém viu" (`unseen`) is on: a Já vi on the Cartaz
   * marks the film's Trocar (#326). */
  readonly unseen: boolean
}

/** A film of the previous version that left, with the reason as the page
 * writes it ("você já viu", "trocado", "até 1h50", "seu Veto: “...”"). */
export type BillboardDropped = {
  readonly position: number
  readonly id: string
  readonly title: string
  readonly reason: string
} & DropCause

/** One line of "Por que cada um vai gostar". */
export interface BillboardLine {
  /** The Presentes (slugs) whose strongest Evidence it is. */
  readonly people: ReadonlyArray<string>
  readonly strength: Strength
  readonly text: string
  readonly source: string | null
}

/** A Presente's Nota prevista [predicted rating] of a film (#174), as the
 * version recorded it. */
export interface BillboardPrediction {
  readonly person: string
  /** 1 to 10, the scale of the Cartaz's Já vi. */
  readonly value: number
  /** "8,3". */
  readonly text: string
  /** How many taste neighbours back it; absent when the version did not
   * store it. */
  readonly raters?: number
}

/** A Presente on the chosen film of a Session with Feedback (#264): the
 * Nota prevista the version stored beside her Reação. She has at least
 * one of the two. */
export interface BillboardReaction {
  readonly person: string
  /** The stored Nota prevista, "8,3"; null when the version had none. */
  readonly predicted: string | null
  /** Her Nota on the 1 to 10 scale of the Já vi, "6"; null without one. */
  readonly rating: string | null
  /** Her Relato; null without one. */
  readonly reaction: ReportLevel | null
}

/** The chosen film of a Session with Feedback when no card shows it: it
 * was outside the Recomendação, or left out of the films shown. */
export interface BillboardChosen {
  readonly id: string
  readonly title: string
  readonly year: number | null
  /** As on a card's `reactions`. */
  readonly reactions: ReadonlyArray<BillboardReaction>
}

export interface BillboardFilm {
  /** On the screen, from 1. */
  readonly position: number
  readonly id: string
  /** The Portuguese title, else the Catalog's. */
  readonly title: string
  /** The Catalog's title when the Portuguese one differs. */
  readonly originalTitle: string | null
  /** Came in with this version (a regenerate). */
  readonly new: boolean
  /** The Aposta [bet] of this version (#178). */
  readonly bet: boolean
  /** The Histórico de apostas required a higher Nota prevista. */
  readonly cautiousBet?: true
  readonly cautiousBetReason?: string
  /** The TMDB poster at w500, or null. */
  readonly poster: string | null
  readonly imdbUrl: string
  /** The official trailer on YouTube (pt-BR, else English); absent with
   * none. */
  readonly trailer?: string
  readonly imdbRating: number | null
  /** "7,5", or null. */
  readonly imdbRatingText: string | null
  /** "2 mil", "1,2 mi", "870". */
  readonly votesText: string
  /** The chips: year, duration and genres in Portuguese. */
  readonly chips: ReadonlyArray<string>
  /** The major awards and nominations saved with the version. */
  readonly awards?: ReadonlyArray<string>
  /** The critics' score saved with the version: "93% no Rotten
   * Tomatoes". */
  readonly critics?: ReadonlyArray<string>
  readonly synopsis: string | null
  /** The strongest Evidence of each Presente with a Fato, the strongest
   * lines first. */
  readonly lines: ReadonlyArray<BillboardLine>
  /** The Presentes with no Fato about it, in order. */
  readonly withoutFact: ReadonlyArray<string>
  /** "Fato sobre 1 de 2". */
  readonly coverage: string
  /** The Presentes with a Nota prevista, in order; a Presente with none is
   * left out, never guessed. */
  readonly predictedRatings: ReadonlyArray<BillboardPrediction>
  /** Only on the chosen film of a Session with Feedback, in the
   * Presentes' order: a Presente with neither is left out. */
  readonly reactions?: ReadonlyArray<BillboardReaction>
  /** The stars and comments the Dono gave it in any version of the
   * Session (#272): they stay in sight after a redo and once the Session
   * is closed. Absent with none. */
  readonly notes?: BillboardNotes
}

/** A film's stars (the last given) and its comments, oldest first. */
export interface BillboardNotes {
  readonly stars: number | null
  readonly comments: ReadonlyArray<string>
}

/** A run of neighbouring films with the same Motivo, under its title. */
export interface BillboardSection {
  /** `bet`: the Aposta; `other`: films with no Motivo for them. */
  readonly kind: ReasonKind | 'bet' | 'other'
  /** "Porque você e Iara gostam de Rui Tavares", "Aposta". */
  readonly title: string
  /** A section above, not next to it, has the same Motivo. */
  readonly again: boolean
  /** The films (IMDb ids), in screen order. */
  readonly films: ReadonlyArray<string>
}

export interface Billboard {
  readonly session: string
  /** The version the Cartaz shows: what `#cartaz <id> v<n>` carries. */
  readonly version: number
  /** "Recomendação de 2026-11-20". */
  readonly title: string
  /** The Presentes, in order. */
  readonly attendees: ReadonlyArray<BillboardPerson>
  readonly request: BillboardRequest
  /** What left the previous version (`dropped`), in order. */
  readonly dropped: ReadonlyArray<BillboardDropped>
  readonly films: ReadonlyArray<BillboardFilm>
  /** The films by Motivo, in order: every film in one section. None in a
   * Session from before #183. */
  readonly sections: ReadonlyArray<BillboardSection>
  /** The Climas the version asked, as the vocabulary names them. */
  readonly moods: ReadonlyArray<string>
  /** Every Clima of the vocabulary, in its order: the Cartaz's chips. */
  readonly moodChoices: ReadonlyArray<string>
  /** The Session is still open: it can take a reply. */
  readonly open: boolean
  /** Only when the Session has Feedback and its chosen film has no card. */
  readonly chosen?: BillboardChosen
}

export interface BillboardRequestInput {
  readonly session: string
  /** Only these films of the Recomendação, in this order; recorded as the
   * Session's `shown` when it is open. */
  readonly shown?: ReadonlyArray<string>
}

/** `cartaz`: the model, how many films it has and the warnings. */
export interface BillboardResult {
  readonly session: string
  readonly films: number
  readonly warnings: ReadonlyArray<string>
  readonly billboard: Billboard
}

const IN_WORDS: Readonly<Record<number, string>> = {
  2: 'dois',
  3: 'três',
  4: 'quatro',
  5: 'cinco',
  6: 'seis',
  7: 'sete',
  8: 'oito',
  9: 'nove',
  10: 'dez',
}

const STRENGTH_ORDER: Readonly<Record<Strength | 'guess', number>> = {
  strong: 0,
  moderate: 1,
  weak: 2,
  guess: 3,
}

const get = (map: YamlValue | undefined, key: string): YamlValue | undefined =>
  isMapping(map) ? map.get(key) : undefined

/** A list field, or none: Python's `x.get(k) or []`. */
const listOf = (value: YamlValue | undefined): ReadonlyArray<YamlValue> =>
  value !== undefined && pyTruthy(value) && isSequence(value) ? value : []

/** A mapping list field, its items as maps. */
const mappings = (value: YamlValue | undefined): ReadonlyArray<YamlMapping> =>
  listOf(value).filter(isMapping)

/** A text field, or null when missing or empty. */
const textOf = (value: YamlValue | undefined): string | null =>
  value !== undefined && pyTruthy(value) ? pyStrValue(value) : null

const texts = (value: YamlValue | undefined): string[] =>
  listOf(value).map((v) => pyStrValue(v))

/** Python's `str.capitalize`, by code point. */
const capitalize = (text: string): string => {
  const [first = '', ...rest] = Array.from(text)
  return first.toUpperCase() + rest.join('').toLowerCase()
}

/** slug → the Presente as the Cartaz shows her (`_pessoas`). */
export const billboardPeople = (
  attendees: ReadonlyArray<string>,
  names: ReadonlyMap<string, string>,
  owner: string | null,
): ReadonlyArray<BillboardPerson> => {
  const listed = attendees.map((slug) => ({
    slug,
    name: names.get(slug) ?? slug,
  }))
  return listed.map(({ slug, name }, position) => {
    const others = listed
      .filter((p) => p.slug !== slug)
      .map((p) => casefold(p.name))
    const chars = Array.from(name)
    let size = 1
    while (
      size < chars.length &&
      others.some((o) => o.startsWith(casefold(chars.slice(0, size).join(''))))
    )
      size++
    return {
      slug,
      name,
      label: slug === owner ? 'Você' : name,
      initial: capitalize(chars.slice(0, size).join('')),
      color: (position % PERSON_COLORS) + 1,
      owner: slug === owner,
    }
  })
}

/** 7 is "7", 6.5 is "6,5" (`_numero`). */
const numberText = (value: number): string =>
  (Number.isInteger(value) ? String(value) : pyRepr(value)).replace('.', ',')

/** 7.25 is "7,2" (`_nota`). */
const oneDecimal = (value: number): string =>
  pyFixed(value, 1).replace('.', ',')

export const imdbRatingLabel = (rating: number): string => oneDecimal(rating)

/** The Notas previstas a version recorded for a film, in the Presentes'
 * order (#175). */
const predictionsOf = (
  item: YamlMapping | undefined,
  attendees: ReadonlyArray<string>,
): BillboardPrediction[] => {
  const recorded = item?.get('predicted_rating')
  return attendees.flatMap((person) => {
    const prediction = get(recorded, person)
    const value = get(prediction, 'value')
    if (value === undefined || value === null) return []
    const raters = get(prediction, 'raters')
    const number = Number(yamlToJson(value))
    return [
      {
        person,
        value: number,
        text: oneDecimal(number),
        ...(raters !== undefined &&
          raters !== null && { raters: Number(yamlToJson(raters)) }),
      },
    ]
  })
}

/** Each Presente's stored Nota prevista beside her Reação to the chosen
 * film (#264). */
const reactionsOf = (
  predicted: ReadonlyArray<BillboardPrediction>,
  given: ReadonlyArray<Reaction>,
  attendees: ReadonlyArray<string>,
): BillboardReaction[] =>
  attendees.flatMap((person) => {
    const prediction = predicted.find((p) => p.person === person)
    const reaction = given.find((r) => r.person === person)
    if (prediction === undefined && reaction === undefined) return []
    const rating = reaction?.rating ?? null
    return [
      {
        person,
        predicted: prediction?.text ?? null,
        rating: rating === null ? null : formatRating(rating * 2),
        reaction: reaction?.reaction ?? null,
      },
    ]
  })

/** 2_400 is "2 mil"; 1_250_000 is "1,2 mi" (`_votos`). */
export const votesText = (votes: number): string => {
  if (votes >= 1_000_000)
    return `${pyFixed(votes / 1e6, 1).replace('.', ',')} mi`
  if (votes >= 1000) return `${pyRound(votes / 1000)} mil`
  return String(votes)
}

/** The reading of the request (`_pedido`). */
const requestOf = (
  front: YamlMapping,
  people: ReadonlyArray<BillboardPerson>,
  minRating: number,
): BillboardRequest => {
  const context = front.get('context')
  const only = people.length === 1 ? people[0] : undefined
  const who =
    only !== undefined
      ? only.label
      : `Vocês ${IN_WORDS[people.length] ?? people.length}`
  const parts: string[] = []
  const max = get(context, 'max_duration')
  if (max !== undefined && pyTruthy(max))
    parts.push(`até ${sessionDuration(Number(yamlToJson(max)))}`)
  parts.push(`nota ${numberText(minRating)}+ no IMDb`)
  parts.push(...texts(get(context, 'moods')))
  // A stored Restrição that no longer exists (an old Session's no_repeat)
  // does not show, nor the one the Session turns on by itself
  // (`out_of_session`): the Dono did not ask for it (#277).
  const stored = mappings(get(context, 'constraints')).map(
    (item) => yamlToJson(item) as StoredConstraint,
  )
  for (const item of stored) {
    const label = askedConstraintLabel(item)
    if (label) parts.push(label)
  }
  const rule = front.get('rule')
  const name = get(rule, 'name')
  if (name === 'average') parts.push('pela média')
  else if (name === 'by') {
    const slug = textOf(get(rule, 'person')) ?? ''
    parts.push(
      `pelo gosto de ${people.find((p) => p.slug === slug)?.name ?? slug}`,
    )
  }
  const speech = get(context, 'request')
  return {
    speech: textOf(speech),
    who,
    parts,
    unseen: stored.some((item) => item.name === 'unseen'),
  }
}

/** What left the previous version, and why (`_saiu`). */
const droppedOf = (
  front: YamlMapping,
  people: ReadonlyArray<BillboardPerson>,
  owner: string | null,
): BillboardDropped[] => {
  const list = front.get('dropped')
  const name = (slug: string) =>
    slug === owner
      ? 'você'
      : (people.find((p) => p.slug === slug)?.name ?? slug)
  const out: BillboardDropped[] = []
  for (const item of mappings(list)) {
    // A file written by hand may lack a field: Python reads it with `.get`.
    const drop = yamlToJson(item) as unknown as Omit<
      BillboardDropped,
      'reason'
    > &
      Partial<{
        people: string[]
        person: string
        text: string
        constraint: string
        label: string
        unseen: UnseenBefore[]
      }>
    let reason: string
    if (drop.cause === 'seen') {
      const who = drop.people ?? []
      const names = [
        who.slice(0, -1).map(name).join(', '),
        who.length > 0 ? name(who.at(-1) ?? '') : '',
      ]
        .filter(Boolean)
        .join(' e ')
      reason = pyStrip(`${names} já ${who.length === 1 ? 'viu' : 'viram'}`)
    } else if (drop.cause === 'constraint' && drop.unseen?.length)
      // The Série na ordem: who did not see the film before (#165).
      reason = unseenText(drop.unseen, name)
    else if (drop.cause === 'constraint' || drop.cause === 'min_rating')
      reason = drop.label || drop.constraint || ''
    else if (drop.cause === 'veto') {
      const by =
        drop.person === owner
          ? 'seu Veto'
          : `Veto de ${name(drop.person ?? '')}`
      reason = `${by}: “${drop.text ?? ''}”`
    } else if (drop.cause === 'mood') reason = 'outro Clima'
    else reason = 'trocado'
    out.push({ ...drop, reason } as BillboardDropped)
  }
  return out
}

const isFact = (e: BodyEvidence) => e.kind !== 'guess'

/** The strongest Evidence of each Presente with a Fato, the ones with the
 * same sharing a line, the strongest lines first (`_linhas`). */
const linesOf = (film: FilmInBody): BillboardLine[] => {
  const groups = new Map<string, { evidence: BodyEvidence; people: string[] }>()
  for (const [person, evidence] of Object.entries(film.evidence)) {
    const strongest = evidence.find(isFact)
    if (strongest === undefined) continue
    const key = JSON.stringify([
      strongest.text,
      strongest.source,
      strongest.date,
      strongest.strength,
      strongest.kind,
    ])
    const group = groups.get(key)
    if (group) group.people.push(person)
    else groups.set(key, { evidence: strongest, people: [person] })
  }
  return [...groups.values()]
    .map((g, index) => ({ g, index }))
    .sort(
      (a, b) =>
        STRENGTH_ORDER[a.g.evidence.strength] -
          STRENGTH_ORDER[b.g.evidence.strength] || a.index - b.index,
    )
    .map(({ g }) => ({
      people: g.people,
      strength: g.evidence.strength as Strength,
      text: g.evidence.text,
      source: g.evidence.source || null,
    }))
}

const REASON_KINDS: ReadonlyArray<ReasonKind> = ['entity', 'film', 'taste']

/** The Motivo the file kept for a film, or null (none, or not readable). */
const storedReason = (value: YamlValue | undefined): FilmReason | null => {
  if (!isMapping(value)) return null
  const kind = textOf(value.get('kind'))
  const reason = REASON_KINDS.find((k) => k === kind)
  if (reason === undefined) return null
  const name = textOf(value.get('name'))
  return {
    kind: reason,
    ...(name !== null && { name }),
    people: texts(value.get('people')),
  }
}

/** A section's title, naming who has its Motivo. */
const sectionTitle = (
  kind: BillboardSection['kind'],
  name: string,
  who: ReadonlyArray<BillboardPerson>,
): string => {
  const names = listText(who.map((p) => (p.owner ? 'você' : p.name)))
  const many = who.length > 1
  switch (kind) {
    case 'bet':
      return 'Aposta'
    case 'other':
      return 'Outras escolhas'
    case 'entity':
      return `Porque ${names} ${many ? 'gostam' : 'gosta'} de ${name}`
    case 'film':
      return `Porque ${names} ${many ? 'gostaram' : 'gostou'} de ${name}`
    case 'taste':
      return `Gente de gosto parecido com ${names} gostou`
  }
}

/** The films in sections: a run of neighbours with the same Motivo is one;
 * the Aposta is always its own. */
const sectionsOf = (
  films: ReadonlyArray<BillboardFilm>,
  reasons: ReadonlyMap<string, FilmReason | null>,
  people: ReadonlyArray<BillboardPerson>,
): BillboardSection[] => {
  type Run = {
    key: string
    kind: BillboardSection['kind']
    name: string
    who: Set<string>
    films: string[]
  }
  const runs: Run[] = []
  for (const film of films) {
    const reason = film.bet ? null : (reasons.get(film.id) ?? null)
    const kind: Run['kind'] = film.bet ? 'bet' : (reason?.kind ?? 'other')
    const name = reason?.name ?? ''
    const key = JSON.stringify([kind, name])
    const last = runs.at(-1)
    const run: Run =
      last !== undefined && last.key === key && kind !== 'bet'
        ? last
        : { key, kind, name, who: new Set<string>(), films: [] }
    if (run !== last) runs.push(run)
    run.films.push(film.id)
    for (const slug of reason?.people ?? []) run.who.add(slug)
  }
  return runs.map((run, i) => ({
    kind: run.kind,
    title: sectionTitle(
      run.kind,
      run.name,
      people.filter((p) => run.who.has(p.slug)),
    ),
    again: runs.slice(0, i).some((r) => r.key === run.key),
    films: run.films,
  }))
}

const onlyShown = (
  id: string,
  films: ReadonlyArray<FilmInBody>,
  shown: ReadonlyArray<string>,
): Effect.Effect<FilmInBody[], EngineError> =>
  Effect.gen(function* () {
    if (shown.length === 0)
      return yield* engineError(
        'invalid_usage',
        '--filmes vazio: passe os IDs do IMDb dos filmes mostrados',
      )
    if (new Set(shown).size !== shown.length)
      return yield* engineError('invalid_usage', '--filmes repete um filme')
    const byId = new Map(films.map((f) => [f.id, f]))
    const outside = shown.filter((f) => !byId.has(f))
    if (outside.length > 0)
      return yield* engineError(
        'invalid_usage',
        `${outside.join(', ')} fora da Recomendação da Sessão ${id}`,
      )
    return shown.map((f, i) => ({
      ...(byId.get(f) as FilmInBody),
      position: i + 1,
    }))
  })

/** One film's card on the Cartaz; a film outside the Catálogo is
 * `invalid_data`. */
const filmCard = (
  db: Connection,
  input: {
    readonly id: string
    readonly film: FilmInBody
    readonly listed: ReadonlyMap<string, YamlMapping>
    readonly attendees: ReadonlyArray<string>
    readonly people: ReadonlyArray<BillboardPerson>
    /** The Feedback's chosen film and reactions, when it has them. */
    readonly feedback: {
      readonly chosen: string
      readonly given: ReadonlyArray<Reaction>
    } | null
  },
) =>
  Effect.gen(function* () {
    const { id, film, listed, attendees, people, feedback } = input
    const row = yield* catalogFilm(db, film.id)
    if (row === undefined)
      return yield* engineError(
        'invalid_data',
        `Sessão ${id}: ${film.id} não está no Catálogo`,
      )
    const header = yield* filmHeader(db, row)
    const trailer = yield* (yield* Tmdb).trailer(film.id)
    const recorded = listed.get(film.id)
    const labels = (key: string) =>
      listOf(recorded?.get(key)).filter((label) => typeof label === 'string')
    const awards = labels('awards')
    const critics = labels('critics')
    const withoutFact = Object.entries(film.evidence)
      .filter(([, evidence]) => !evidence.some(isFact))
      .map(([person]) => person)
    const title = header.titlePt || row.title
    const chips = [
      ...(row.year ? [String(row.year)] : []),
      ...(row.runtimeMinutes ? [sessionDuration(row.runtimeMinutes)] : []),
      ...header.genres,
    ]
    const card: BillboardFilm = {
      position: film.position,
      id: film.id,
      title,
      originalTitle:
        header.titlePt && header.titlePt !== row.title ? row.title : null,
      new: pyTruthy(recorded?.get('new') ?? false),
      bet: pyTruthy(recorded?.get('bet') ?? false),
      ...(isCautiousBet(recorded) && {
        cautiousBet: true as const,
        cautiousBetReason: CAUTIOUS_BET_REASON,
      }),
      poster: header.poster ? header.poster.replace('/w185/', '/w500/') : null,
      imdbUrl: header.imdbUrl,
      ...(trailer !== null && { trailer }),
      imdbRating: header.imdbRating,
      imdbRatingText:
        header.imdbRating === null ? null : imdbRatingLabel(header.imdbRating),
      votesText: votesText(header.imdbVotes),
      chips,
      ...(awards.length > 0 && { awards }),
      ...(critics.length > 0 && { critics }),
      synopsis: header.synopsis,
      lines: linesOf(film),
      withoutFact,
      coverage: `Fato sobre ${people.length - withoutFact.length} de ${people.length}`,
      predictedRatings: predictionsOf(recorded, attendees),
    }
    if (feedback?.chosen !== film.id) return card
    return {
      ...card,
      reactions: reactionsOf(card.predictedRatings, feedback.given, attendees),
    }
  })

/** The chosen film when no card shows it, with the Nota prevista the
 * version stored when it was in the Recomendação; `null` when the Catálogo
 * no longer has it. */
const chosenWithoutCard = (
  db: Connection,
  feedback: {
    readonly chosen: string
    readonly given: ReadonlyArray<Reaction>
  },
  listed: ReadonlyMap<string, YamlMapping>,
  attendees: ReadonlyArray<string>,
): Effect.Effect<
  BillboardChosen | null,
  EngineError | SqliteError,
  Tmdb | Run
> =>
  Effect.gen(function* () {
    const row = yield* catalogFilm(db, feedback.chosen)
    if (row === undefined) return null
    const header = yield* filmHeader(db, row)
    return {
      id: feedback.chosen,
      title: header.titlePt || row.title,
      year: row.year,
      reactions: reactionsOf(
        predictionsOf(listed.get(feedback.chosen), attendees),
        feedback.given,
        attendees,
      ),
    }
  })

/** The stars and comments of every reply of every version, by film
 * (#272): the versions in order, then the current one. */
const notesOf = (front: YamlMapping): Map<string, BillboardNotes> => {
  const replies = [
    ...listOf(front.get('versions')).flatMap((version) =>
      isMapping(version) ? listOf(version.get('replies')) : [],
    ),
    ...listOf(front.get('replies')),
  ]
  const notes = new Map<string, { stars: number | null; comments: string[] }>()
  for (const reply of replies) {
    if (!isMapping(reply)) continue
    for (const film of mappings(reply.get('films'))) {
      const id = pyStrValue(film.get('id') ?? null)
      const note = notes.get(id) ?? { stars: null, comments: [] }
      const stars = yamlToJson(film.get('stars') ?? null)
      if (typeof stars === 'number') note.stars = stars
      const comment = textOf(film.get('comment'))
      if (comment && !note.comments.includes(comment))
        note.comments.push(comment)
      notes.set(id, note)
    }
  }
  return notes
}

/** The Cartaz of a Session (`cartaz.gerar`), as data. Reads only. */
export const billboardModel = (
  input: BillboardRequestInput,
): Effect.Effect<Billboard, EngineError | SqliteError, EngineServices | Run> =>
  Effect.gen(function* () {
    const id = input.session
    const { frontmatter: front, body } = yield* readSession(id)
    const attendees = texts(front.get('attendees'))
    let films: ReadonlyArray<FilmInBody> = filmsInBody(attendees, body)
    if (input.shown !== undefined)
      films = yield* onlyShown(id, films, input.shown)
    const { weights } = yield* Environment
    // "Você" is whoever looks: the logged-in Pessoa, else the Session's Dono.
    const owner = (yield* Owner) ?? textOf(front.get('owner'))
    const listed = new Map<string, YamlMapping>()
    for (const item of mappings(front.get('recommendation')))
      listed.set(pyStrValue(item.get('id') ?? null), item)
    const withReasons = [...listed.values()].some((item) => item.has('reason'))
    const reasons = new Map(
      [...listed].map(([filmId, item]) => [
        filmId,
        storedReason(item.get('reason')),
      ]),
    )
    const chosen = front.get('chosen')
    const feedback =
      isOpen(front) || !pyTruthy(chosen ?? null)
        ? null
        : {
            chosen: pyStrValue(chosen ?? null),
            given: readableReactions(id, front),
          }
    return yield* (yield* Sqlite).read((db) =>
      Effect.gen(function* () {
        const names = new Map(
          (yield* db.all('SELECT slug, nome FROM pessoas')).map((row) => [
            String(row['slug']),
            String(row['nome']),
          ]),
        )
        const people = billboardPeople(attendees, names, owner)
        const notes = notesOf(front)
        const cards: BillboardFilm[] = []
        for (const film of films) {
          const card = yield* filmCard(db, {
            id,
            film,
            listed,
            attendees,
            people,
            feedback,
          })
          const note = notes.get(film.id)
          cards.push(note === undefined ? card : { ...card, notes: note })
        }
        const chosenBlock =
          feedback === null || cards.some((c) => c.id === feedback.chosen)
            ? null
            : yield* chosenWithoutCard(db, feedback, listed, attendees)
        return {
          session: id,
          version: Number(
            yamlToJson(currentVersion(front).get('version') ?? null),
          ),
          title: `Recomendação de ${pyStrValue(front.get('date') ?? null)}`,
          attendees: people,
          request: requestOf(front, people, weights.catalog.min_imdb_rating),
          dropped: droppedOf(front, people, owner),
          films: cards,
          sections: withReasons ? sectionsOf(cards, reasons, people) : [],
          moods: texts(get(front.get('context'), 'moods')),
          moodChoices: (yield* readMoods).map((m) => m.name),
          open: isOpen(front),
          ...(chosenBlock !== null && { chosen: chosenBlock }),
        }
      }),
    )
  })

/** Records in `shown` the films the Dono saw, in screen order
 * (`sessao.mostrar`). A Session with Feedback stays as it is: the chosen
 * film's position was already recorded. No database row changes. */
export const showFilms = (
  id: string,
  shown: ReadonlyArray<string>,
): Effect.Effect<
  void,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const writer = yield* DataWriter
    const author = yield* authorFor(yield* sessionOwner(id))
    yield* writer.write({ author, message: `show billboard ${id}` }, () =>
      Effect.gen(function* () {
        const { frontmatter, body } = yield* readSession(id)
        if (!isOpen(frontmatter)) return
        const titles = new Map<string, YamlValue>()
        const recommendation = frontmatter.get('recommendation')
        for (const item of mappings(recommendation))
          titles.set(
            pyStrValue(item.get('id') ?? null),
            item.get('title') ?? null,
          )
        const front = new Map(frontmatter)
        front.set(
          'shown',
          shown.map(
            (film, i) =>
              new Map<string, YamlValue>([
                ['position', pyInt(i + 1)],
                ['id', film],
                ['title', titles.get(film) ?? null],
              ]),
          ),
        )
        yield* writeSession(id, front, body)
      }),
    )
  })

/** `cartaz`: the Cartaz of a Session and, with `shown`, records them as
 * the films the Dono saw. The warnings are the sources' (a missing TMDB
 * key). */
export const billboard = (
  input: BillboardRequestInput,
): Effect.Effect<
  BillboardResult,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const run = yield* Run
    const before = (yield* run.warnings).length
    const model = yield* billboardModel(input)
    if (input.shown !== undefined) yield* showFilms(input.session, input.shown)
    return {
      session: input.session,
      films: model.films.length,
      warnings: (yield* run.warnings).slice(before),
      billboard: model,
    }
  })
