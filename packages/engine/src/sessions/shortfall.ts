// The Falta [shortfall] of a version (#357, map #355): fewer films passed
// than the Recomendação asked, or the engine relaxed a Restrição to fill it
// (#358). The version of the Session stores it and the Cartaz says it in a
// strip at its top; without it the list would shrink in silence.

import { Schema } from 'effect'
import { listText } from '../evidence/wording.ts'
import type { RelaxedConstraint } from '../recommendation/constraints.ts'
import type { Recommendation } from '../recommendation/recommend.ts'

/** A Restrição the engine relaxed to fill the list (#358). */
export type ShortfallRelaxed = RelaxedConstraint

export interface Shortfall {
  /** How many films the request asked. */
  readonly asked: number
  /** How many it got. */
  readonly found: number
  /** The titles of the Parecido's references, when one was asked: its
   * similar films are the ones that ran out. Empty without one. */
  readonly similar: ReadonlyArray<string>
  /** What was relaxed to fill the list, in the order it was. */
  readonly relaxed: ReadonlyArray<ShortfallRelaxed>
}

const titlesOf = (recommendation: Recommendation): ReadonlyArray<string> => {
  const titles = recommendation.constraints['similar']?.['titles']
  return Array.isArray(titles) ? titles.map(String) : []
}

/** The Falta of a Recomendação that asked for `asked` films; undefined
 * when the list is full and nothing was relaxed. */
export const shortfallOf = (
  recommendation: Recommendation,
  asked: number,
  relaxed: ReadonlyArray<ShortfallRelaxed> = [],
): Shortfall | undefined => {
  const found = recommendation.films.length
  if (found >= asked && relaxed.length === 0) return undefined
  return { asked, found, similar: titlesOf(recommendation), relaxed }
}

/** After a relax that did not fill the list: how many came. */
const stillShort = (found: number, asked: number): string => {
  if (found >= asked) return ''
  return found === 1
    ? ` Veio 1 dos ${asked} filmes pedidos.`
    : ` Vieram ${found} dos ${asked} filmes pedidos.`
}

/** The strip at the top of the Cartaz: "Acabaram os parecidos com Home
 * Alone; entraram 3 de antes de 1990". */
export const shortfallText = (shortfall: Shortfall): string => {
  const { asked, found, similar, relaxed } = shortfall
  const ranOut =
    similar.length > 0 ? `Acabaram os parecidos com ${listText(similar)}` : null
  if (relaxed.length > 0) {
    const verb =
      relaxed.length === 1 && relaxed[0]?.films === 1 ? 'entrou' : 'entraram'
    const groups = listText(
      relaxed.map(({ films, text }) => `${films} ${text}`),
    )
    return `${ranOut ?? 'Faltaram filmes'}; ${verb} ${groups}.${stillShort(found, asked)}`
  }
  if (ranOut !== null)
    return `${ranOut}: ${found === 1 ? 'veio 1' : `vieram ${found}`} dos ${asked} filmes pedidos.`
  if (found === 0) return `Nenhum filme passou nas Restrições.`
  return found === 1
    ? `Só 1 filme passou nas Restrições, dos ${asked} pedidos.`
    : `Só ${found} filmes passaram nas Restrições, dos ${asked} pedidos.`
}

const isCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const isStoredShortfall = Schema.is(
  Schema.Struct({
    asked: isCount,
    found: isCount,
    similar: Schema.optionalKey(Schema.Unknown),
    relaxed: Schema.optionalKey(Schema.Unknown),
  }),
)
const isStoredTitles = Schema.is(Schema.Array(Schema.String))
const isStoredRelaxed = Schema.is(
  Schema.Struct({
    constraint: Schema.String,
    films: Schema.Int.check(Schema.isGreaterThan(0)),
    text: Schema.String,
  }),
)

/** Reads the Falta of a stored version. Older versions can omit the
 * lists, and an incomplete refill entry cannot describe what came in. */
export const storedShortfall = (value: unknown): Shortfall | undefined => {
  if (!isStoredShortfall(value)) return undefined
  const { asked, found, similar, relaxed } = value
  return {
    asked,
    found,
    similar: isStoredTitles(similar) ? similar : [],
    relaxed: Array.isArray(relaxed) ? relaxed.filter(isStoredRelaxed) : [],
  }
}
