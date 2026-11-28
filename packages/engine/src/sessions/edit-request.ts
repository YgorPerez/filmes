// Editing an open Session's request and Restrições (#372, map #369): the
// app's form gives the whole request again, and saving is a refazer with
// Mantidos. Every film on the current screen is kept: the ones a new Veto
// or Restrição breaks drop and their places refill, and a new Clima or a
// new similar replaces the list (#179, #68). No Python twin.
//
// The edit replaces the request: a field it leaves out is a Restrição
// removed, the inherited ones too (the similar goes with `noSimilar`, the
// Série na ordem back to its default). The Presentes and the Regra stay
// the current version's; the size (`count`) is the form's, or the current
// one when it leaves it out. Each film that stays keeps its number. A told
// Session refuses (`closed_session`), and so do a Dono who is not among the
// Presentes and an edit of a version that is no longer the current one.

import { Effect } from 'effect'
import { isMapping, isSequence, yamlToJson } from '../data/yaml.ts'
import {
  DEFAULT_SERIES_ORDER,
  SERIES_ORDER_MODES,
} from '../recommendation/constraints/series-order.ts'
import type { RecommendSessionRequest } from './open.ts'
import { currentVersion, shownFilms } from './file.ts'
import { editSession, openSessionFront } from './redo.ts'
import { sessionRedoRequest } from './redo-request.ts'

/** What the edit form asks: the request and the Restrições, everything
 * the Session keeps in its context. */
export type SessionRequestEdit = Pick<
  RecommendSessionRequest,
  | 'request'
  | 'count'
  | 'maxDuration'
  | 'since'
  | 'until'
  | 'language'
  | 'child'
  | 'triggers'
  | 'similar'
  | 'unseen'
  | 'noSlow'
  | 'noSad'
  | 'noMoods'
  | 'seriesOrder'
> & {
  readonly moods: ReadonlyArray<string>
  /** The version the edit was made on; the current one when left out. */
  readonly version?: number
}

/** The fields of the current request the form shows again, as they were;
 * the similar and the Série na ordem come from the stored Restrições. */
const EDIT_FIELDS = [
  'request',
  'count',
  'maxDuration',
  'since',
  'until',
  'language',
  'child',
  'triggers',
  'unseen',
  'noSlow',
  'noSad',
  'noMoods',
] as const satisfies ReadonlyArray<keyof SessionRequestEdit>

/** What the edit form starts with: the current version's request and
 * Restrições, the inherited ones too (the similar's references, a Série
 * na ordem other than the default), and who the Presentes are. */
export const sessionRequestEditDraft = (id: string) =>
  Effect.gen(function* () {
    const front = yield* openSessionFront(id)
    const asked = yield* sessionRedoRequest(id)
    const context = front.get('context')
    const list = isMapping(context) ? context.get('constraints') : undefined
    const stored = (isSequence(list) ? list : [])
      .filter(isMapping)
      .map((item) => yamlToJson(item) as Record<string, unknown>)
    const films = stored.find((c) => c['name'] === 'similar')?.['films']
    const mode = SERIES_ORDER_MODES.find(
      (m) => m === stored.find((c) => c['name'] === 'series_order')?.['mode'],
    )
    const draft: SessionRequestEdit & {
      readonly attendees: ReadonlyArray<string>
    } = {
      ...(Object.fromEntries(
        EDIT_FIELDS.filter((key) => asked[key] !== undefined).map((key) => [
          key,
          asked[key],
        ]),
      ) as SessionRequestEdit),
      attendees: asked.attendees ?? [],
      moods: asked.moods ?? [],
      ...(Array.isArray(films) &&
        films.length > 0 && { similar: films.map(String) }),
      ...(mode !== undefined &&
        mode !== DEFAULT_SERIES_ORDER && { seriesOrder: mode }),
    }
    return draft
  })

/** The redo's warning about a keep it ignored speaks of `--manter`, which
 * the edit never asked. */
const aboutKeep = (warning: string) => warning.startsWith('--manter ')

/** Redoes open Session `id` with `edit` as its request, keeping the films
 * that still pass. */
export const editSessionRequest = (
  id: string,
  { version, ...edit }: SessionRequestEdit,
) =>
  Effect.gen(function* () {
    const front = yield* openSessionFront(id)
    const current = yield* sessionRedoRequest(id)
    const keep = shownFilms(currentVersion(front)).map((film) => film.id)
    const redone = yield* editSession(
      front,
      {
        ...edit,
        attendees: current.attendees,
        session: id,
        rule: current.rule,
        by: current.by,
        count: edit.count ?? current.count,
        // Empty words clear the ones the Session kept.
        request: edit.request ?? '',
        noSimilar: !edit.similar?.length,
        seriesOrder: edit.seriesOrder ?? DEFAULT_SERIES_ORDER,
        keep: keep.length > 0 ? [keep.join(',')] : undefined,
      },
      version,
    )
    return {
      ...redone,
      warnings: redone.warnings.filter((warning) => !aboutKeep(warning)),
    }
  })
