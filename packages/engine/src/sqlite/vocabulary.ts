// The closed-list values the derived database stores. The Python engine
// builds it, and its rows stay in Portuguese until reconstruct is ported and
// Python leaves (#76 §2.2): a Nota's `tipo` is `nota`, an edge's `predicado`
// is `diretor`, a Veto to a tag group keeps the Portuguese group key. The
// engine reads them here into its English names, and a test keeps every map
// equal to Python's names (`test/python-names.ts`).

import type { Kind, Level, Link } from '../evidence/strength.ts'

/** `tipo` of `notas`, `ja_visto`, `declarados`, `relatos`, `reacoes`. */
const KIND: Readonly<Record<string, Kind>> = {
  metadado: 'metadata',
  nota: 'rating',
  declarado: 'stated',
  relato: 'report',
  review: 'review',
  palpite: 'guess',
}

/** `predicado` of `arestas` for each content link (`elo` of `ajustes`). */
export const LINK_PREDICATE: Readonly<Record<Link, string>> = {
  director: 'diretor',
  writer: 'roteiro',
  series: 'serie',
  cast: 'elenco',
  genre: 'genero',
}

/** `nivel` of `ajustes`. */
const LEVEL: Readonly<Record<string, Level>> = {
  nada: 'none',
  pouco: 'low',
  normal: 'normal',
  muito: 'high',
}

/** A tag group key, as `vetos.alvo` stores it, and its `tag_vetoes.toml`
 * table. */
const TAG_GROUP: Readonly<Record<string, string>> = {
  comedia_boba: 'silly_comedy',
  lento: 'slow',
}

const read = <A extends string>(
  table: Readonly<Record<string, A>>,
  what: string,
  value: string,
): A => {
  const name = table[value]
  if (name === undefined)
    throw new Error(`the database has an unknown ${what}: '${value}'`)
  return name
}

/** The Kind of a stored `tipo`. */
export const kindOf = (value: string): Kind => read(KIND, 'tipo', value)

/** The Level of a stored `nivel`. */
export const levelOf = (value: string): Level => read(LEVEL, 'nivel', value)

/** The link of a stored `elo` or `predicado`; `undefined` for a predicate
 * that is not a content link (`pais`, `lista`...). */
export const linkOf = (predicate: string): Link | undefined =>
  (Object.keys(LINK_PREDICATE) as Link[]).find(
    (link) => LINK_PREDICATE[link] === predicate,
  )

/** A Veto target as the engine names it: a tag group by its English key,
 * a film or entity id as it is. */
export const targetOf = (value: string): string => TAG_GROUP[value] ?? value
