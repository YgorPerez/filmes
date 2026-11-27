// The Falta [shortfall] of a version (#357, map #355): fewer films passed
// than the Recomendação asked, or the engine relaxed a Restrição to fill it
// (#358). The version of the Session stores it and the Cartaz says it in a
// strip at its top; without it the list would shrink in silence.

import { andList } from '../recommendation/constraints/similar.ts'
import type { Recommendation } from '../recommendation/recommend.ts'

/** A Restrição the engine relaxed to fill the list (#358). */
export interface ShortfallRelaxed {
  /** The Restrição's name: `similar`, `since`. */
  readonly constraint: string
  /** How many films came in because of it. */
  readonly films: number
  /** What those films are, after "entraram 3": "de antes de 1990", "que
   * não são parecidos". */
  readonly text: string
}

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

const cameIn = (r: ShortfallRelaxed): string =>
  `${r.films === 1 ? 'entrou 1' : `entraram ${r.films}`} ${r.text}`

/** The strip at the top of the Cartaz: "Acabaram os parecidos com Home
 * Alone; entraram 3 de antes de 1990". */
export const shortfallText = (shortfall: Shortfall): string => {
  const { asked, found, similar, relaxed } = shortfall
  const ranOut =
    similar.length > 0 ? `Acabaram os parecidos com ${andList(similar)}` : null
  if (relaxed.length > 0)
    return `${ranOut ?? 'Faltaram filmes'}; ${andList(relaxed.map(cameIn))}.`
  if (ranOut !== null)
    return `${ranOut}: ${found === 1 ? 'veio 1' : `vieram ${found}`} dos ${asked} filmes pedidos.`
  if (found === 0) return `Nenhum filme passou nas Restrições.`
  return found === 1
    ? `Só 1 filme passou nas Restrições, dos ${asked} pedidos.`
    : `Só ${found} filmes passaram nas Restrições, dos ${asked} pedidos.`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The Falta a version stored, as `yamlToJson` reads it; undefined when
 * it has none or it is not one. */
export const storedShortfall = (value: unknown): Shortfall | undefined => {
  if (!isRecord(value)) return undefined
  const { asked, found, similar, relaxed } = value
  if (typeof asked !== 'number' || typeof found !== 'number') return undefined
  return {
    asked,
    found,
    similar: Array.isArray(similar) ? similar.map(String) : [],
    relaxed: (Array.isArray(relaxed) ? relaxed : [])
      .filter(isRecord)
      .map((r) => ({
        constraint: String(r['constraint']),
        films: Number(r['films']),
        text: String(r['text']),
      })),
  }
}
