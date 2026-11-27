// Parecido [similar]: only the films most similar to one or more references
// pass (`restricoes/parecido.py`, #67).
//
// The similarity of each pair comes from `similarity.ts`; with several
// references it is the mean over them (a reference the film has nothing in
// common with counts 0). Only the `[similar] candidates` most similar pass,
// counted over the whole Catálogo, before the other Restrições and the
// minimum rating; a reference never comes in. Among those, the Regra orders
// as always.
//
// Each film that passes carries, per reference it has something in common
// with, the line "parecido com X: tags em comum; vizinho do MovieLens; mesmo
// diretor", cited from what comes first (the Wikidata edge when it is only
// the director). The line is no Fato: it adds to nobody's utility, and a
// film with only it is still "só palpites". If fewer pass than asked, the
// list comes out shorter, with a warning. Nothing is written to any Pessoa.
//
// In a Session (#68), the references are stored in the version's
// `context.constraints`, and a refazer without `similar` keeps them
// (`inherit`); other references replace them, and `noSimilar` drops the
// filter. New references on an open Session replace the whole list
// (`replacesList`): `--manter` is ignored, and whoever leaves leaves
// through it.

import { Effect } from 'effect'
import { factId } from '../../compat/fact-id.ts'
import { compareTuple } from '../../compat/compare.ts'
import { pyStrip } from '../../compat/text.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import { similarStrength } from '../../evidence/ruler.ts'
import { neighborhoodText } from '../../evidence/wording.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { num, text, textOrNull } from '../../sqlite/row.ts'
import type { Weights } from '../../runtime/Weights.ts'
import type { Connection, Row } from '../../sqlite/Sqlite.ts'
import {
  pass,
  type Constraint,
  type ConstraintModule,
  type Pass,
  type StoredConstraint,
} from '../constraints.ts'
import {
  jsonList,
  mainThemes,
  measure,
  pairValue,
  type Pair,
} from '../similarity.ts'

export interface SimilarRequest {
  /** `--parecido`: IMDb ids; an item may hold several separated by
   * commas. */
  readonly similar?: ReadonlyArray<string>
  /** `--sem-parecido`: on a refazer, drops the filter the Session had. */
  readonly noSimilar?: boolean
  /** The Session being redone (`--sessao`); `noSimilar` holds only with
   * it. */
  readonly session?: string | null
}

/** "A", "A e B", "A, B e C" (`_e`). */
const andList = (names: ReadonlyArray<string>): string =>
  names.length === 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} e ${names.at(-1) ?? ''}`

const storedFilms = (stored: StoredConstraint | undefined): string[] => {
  const films = stored?.['films']
  return Array.isArray(films) ? films.map(String) : []
}

/** The text and citation of the line for one reference (`_linhas`). */
const line = (
  reference: Row,
  referenceId: string,
  filmId: string,
  pair: Pair,
): Evidence => {
  const themes = mainThemes(pair)
  const parts: string[] = []
  if (themes.length > 0) parts.push(themes.map(([tag]) => tag).join(', '))
  if (pair.neighbor) {
    const { base, both } = pair.neighbor
    parts.push(neighborhoodText(base, both))
  }
  if (pair.director) parts.push('mesmo diretor')
  const cited = themes[0]?.[1] ??
    pair.neighbor ??
    pair.director ?? {
      source: 'IMDb',
      date: textOrNull(reference, 'data_imdb'),
    }
  const title = text(reference, 'titulo')
  return makeEvidence({
    person: null,
    filmId,
    text: `parecido com ${title}${parts.length > 0 ? `: ${parts.join('; ')}` : ''}`,
    source: cited.source,
    date: cited.date,
    strength: similarStrength(),
    kind: 'review',
    factId: factId('parecido', referenceId, filmId),
    base: 0,
    countsAsFact: false,
  })
}

/** Each reference's row, in the order asked; fails on one outside the
 * Catálogo. */
const readReferences = (db: Connection, films: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const references = new Map<string, Row>()
    for (const id of films) {
      const row = yield* db.get('SELECT * FROM filmes WHERE id = ?', id)
      if (row === undefined)
        return yield* engineError(
          'invalid_usage',
          `--parecido ${id}: filme fora do Catálogo`,
        )
      references.set(id, row)
    }
    return references
  })

/** Each reference's pairs, and the `config.candidates` films most similar
 * to the references together. */
const mostSimilarTo = (
  db: Connection,
  references: ReadonlyMap<string, Row>,
  config: Weights['similar'],
) =>
  Effect.gen(function* () {
    const pairs = new Map<string, Map<string, Pair>>()
    for (const id of references.keys())
      pairs.set(id, yield* measure(db, id, config))
    const values = new Map<string, number>()
    for (const ofReference of pairs.values())
      for (const [filmId, pair] of ofReference)
        if (!references.has(filmId))
          values.set(
            filmId,
            (values.get(filmId) ?? 0) +
              pairValue(pair, config.weight) / references.size,
          )
    const votes = new Map(
      (yield* db.all(
        'SELECT id, votos FROM filmes WHERE id IN (SELECT value FROM json_each(?))',
        jsonList(values.keys()),
      )).map((row) => [text(row, 'id'), num(row, 'votos')]),
    )
    // A MovieLens film outside the Catálogo does not count among the
    // most similar.
    const key = (id: string) => [
      -(values.get(id) ?? 0),
      -(votes.get(id) ?? 0),
      id,
    ]
    const mostSimilar = [...votes.keys()]
      .sort((a, b) => compareTuple(key(a), key(b)))
      .slice(0, config.candidates)
    return { pairs, mostSimilar }
  })

const similar = (films: ReadonlyArray<string>): Constraint => {
  // The titles are known once `evaluate` has read the references, as in
  // Python, where `avaliar` fills `self.titulos`.
  let titles: string[] = []
  return {
    name: 'similar',
    toJson: () => ({ films: [...films], titles: [...titles] }),
    stored: () => ({ name: 'similar', films: [...films], titles: [...titles] }),
    result: () => ({}),
    replacesList: (stored) => {
      const before = new Set(storedFilms(stored))
      return films.length !== before.size || films.some((id) => !before.has(id))
    },
    evaluate: (context, alive) =>
      Effect.gen(function* () {
        const { db } = context
        const references = yield* readReferences(db, films)
        titles = [...references.values()].map((row) => text(row, 'titulo'))
        const { pairs, mostSimilar } = yield* mostSimilarTo(
          db,
          references,
          context.weights.similar,
        )
        const verdicts = new Map<string, Pass>()
        for (const filmId of mostSimilar) {
          if (!alive.has(filmId)) continue
          const lines: Evidence[] = []
          for (const [referenceId, reference] of references) {
            const pair = pairs.get(referenceId)?.get(filmId)
            if (pair) lines.push(line(reference, referenceId, filmId, pair))
          }
          verdicts.set(filmId, pass(lines))
        }
        return verdicts
      }),
    listWarning: (found, count) => {
      if (found >= count) return null
      if (found === 1)
        return `só 1 parecido com ${andList(titles)} passou nas Restrições`
      return `só ${found} parecidos com ${andList(titles)} passaram nas Restrições`
    },
  }
}

export const similarModule: ConstraintModule<SimilarRequest> = {
  name: 'similar',
  read: (request) =>
    Effect.gen(function* () {
      if (request.noSimilar) {
        if (!request.session)
          return yield* engineError(
            'invalid_usage',
            '--sem-parecido só vale com --sessao: tira o parecido que a Sessão trazia',
          )
        if (request.similar?.length)
          return yield* engineError(
            'invalid_usage',
            '--parecido e --sem-parecido juntos: escolha um',
          )
        return undefined
      }
      const ids = (request.similar ?? [])
        .flatMap((item) => item.split(','))
        .map(pyStrip)
        .filter((id) => id !== '')
      return ids.length > 0 ? similar([...new Set(ids)]) : undefined
    }),
  label: (stored) => {
    const titles = stored['titles']
    const names =
      Array.isArray(titles) && titles.length > 0
        ? titles.map(String)
        : storedFilms(stored)
    return `parecidos com ${andList(names)}`
  },
  inherit: (request, stored) => {
    if (!stored || request.similar?.length || request.noSimilar) return request
    const films = storedFilms(stored)
    return films.length > 0
      ? { ...request, similar: films }
      : { ...request, similar: undefined }
  },
}
