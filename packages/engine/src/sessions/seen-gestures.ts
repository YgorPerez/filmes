// Vi e gostei / Vi e não gostei [seen gestures] (#378): the group swipe's up
// and down, for a film the Presente already saw. They go with the Votos'
// submission (`castVotes`) but are no Voto.
//
// - The film leaves the group list at once, like the Cartaz's Já vi: the
//   Fora da Sessão Restrição and the redo's `dropped` read every gesture of
//   the Session, waiting or not, as a Já vi of that Presente.
// - Each becomes a Já visto with no Nota and a specific Declarado with no
//   number (`like` or `dislike`) of that Presente about the film, from the
//   Cartaz's Fonte (`cartaz <session>`), so deleting the Session with
//   Apagar tudo takes them too.
// - The Session's Dono's go into her file at once. A guest's wait in the
//   Session's `seen_gestures:` for the Dono's yes, like the Perguntas par a
//   par's answers, and she records or discards them with those:
//
//       seen_gestures:
//       - {person: iara, film: tt9000101, reaction: dislike, date: '2026-11-20'}
//       - {person: dono, film: tt9000203, reaction: like, date: '2026-11-20', recorded_on: '2026-11-20'}

import { Effect, Schema } from 'effect'
import {
  isSequence,
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
  type Statement,
} from '../people/Person.ts'
import type { Connection } from '../sqlite/Sqlite.ts'
import { billboardSource } from './facts.ts'

/** How the Presente felt about the film she saw: up is `like`, down is
 * `dislike`. */
export type SeenReaction = 'like' | 'dislike'

/** A gesture as the swipe sends it. */
export interface SeenGesture {
  readonly film: string
  readonly reaction: SeenReaction
}

const StoredGesture = Schema.Struct({
  person: Schema.String,
  film: Schema.String,
  reaction: Schema.Literals(['like', 'dislike']),
  date: Schema.String,
  recorded_on: Schema.optionalKey(Schema.String),
  discarded_on: Schema.optionalKey(Schema.String),
})
type StoredGesture = typeof StoredGesture.Type
const isStoredGesture = Schema.is(StoredGesture)

const KEY = 'seen_gestures'

const storedList = (front: YamlMapping): YamlValue[] => {
  const list = front.get(KEY)
  return pyTruthy(list) && isSequence(list) ? [...list] : []
}

/** The Session's gestures, oldest first. */
const storedGestures = (front: YamlMapping): StoredGesture[] =>
  storedList(front).map(yamlToJson).filter(isStoredGesture)

const waits = (g: StoredGesture) =>
  g.recorded_on === undefined && g.discarded_on === undefined

/** Film → who gestured it in the Session, waiting or not: each one is out
 * of the Session as a Já vi. */
export const gesturedFilms = (
  front: YamlMapping,
): ReadonlyMap<string, ReadonlyArray<string>> => {
  const out = new Map<string, string[]>()
  for (const { film, person } of storedGestures(front)) {
    const people = out.get(film) ?? []
    if (!people.includes(person)) out.set(film, [...people, person])
  }
  return out
}

/** The gestures that wait for the Dono's yes, with the Presente. */
export const waitingGestures = (
  front: YamlMapping,
): ReadonlyArray<{
  readonly person: string
  readonly film: string
  readonly reaction: SeenReaction
}> => storedGestures(front).filter(waits)

/** Keeps `person`'s gestures in `front`; `recordedOn` for the ones already
 * in her file. */
export const addGestures = (
  front: Map<string, YamlValue>,
  person: string,
  gestures: ReadonlyArray<SeenGesture>,
  today: string,
  recordedOn: string | null,
): void => {
  if (gestures.length === 0) return
  front.set(KEY, [
    ...storedList(front),
    ...gestures.map(
      ({ film, reaction }) =>
        new Map<string, YamlValue>([
          ['person', person],
          ['film', film],
          ['reaction', reaction],
          ['date', today],
          ...(recordedOn === null
            ? []
            : ([['recorded_on', recordedOn]] as const)),
        ]),
    ),
  ])
}

/** Marks `person`'s waiting gestures recorded or discarded on `today`;
 * all of them with `person` null. */
export const settleGestures = (
  front: Map<string, YamlValue>,
  person: string | null,
  record: boolean,
  today: string,
): void => {
  const list = storedList(front)
  if (list.length === 0) return
  front.set(
    KEY,
    list.map((item) => {
      const g = yamlToJson(item)
      return isStoredGesture(g) &&
        waits(g) &&
        (person === null || g.person === person)
        ? new Map([
            ...(item as YamlMapping),
            [record ? 'recorded_on' : 'discarded_on', today],
          ])
        : item
    }),
  )
}

/** What a gesture says, as the Declarado's text. */
const SAID: Readonly<Record<SeenReaction, string>> = {
  like: 'vi e gostei',
  dislike: 'vi e não gostei',
}

/** Writes the gestures into the Pessoa's file: a Já visto with no Nota,
 * unless the Session's Fonte already has one of the film, and a specific
 * Declarado that replaces the Session's earlier one about the film. */
export const recordGestures = (
  db: Connection | null,
  input: {
    readonly person: Person
    readonly gestures: ReadonlyArray<SeenGesture>
    readonly session: string
    readonly today: string
  },
) =>
  Effect.gen(function* () {
    const { gestures, session, today } = input
    let person = input.person
    if (gestures.length === 0) return person
    const connection = yield* required(db)
    const source = billboardSource(session)
    for (const { film, reaction } of gestures) {
      const label = yield* targetLabel(connection, film)
      const seen = yield* items(person, 'seen')
      if (!seen.some((s) => s.source === source && s.target === film))
        person = (yield* addItem(person, 'seen', {
          date: today,
          source,
          target: film,
          label,
          rating: null,
        })).person
      for (const s of yield* items(person, 'stated'))
        if (s.source === source && s.target === film)
          person = yield* removeItem(person, 'stated', s)
      const statement: Statement = {
        date: today,
        source,
        specific: true,
        text: SAID[reaction],
        reaction,
        target: film,
        label,
      }
      person = (yield* addItem(person, 'stated', statement)).person
    }
    yield* savePersonAndSync(db, person)
    return person
  })
