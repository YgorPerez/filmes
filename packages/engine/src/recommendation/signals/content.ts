// The one-hop content path: a Pessoa's Nota → entity → Candidate
// (`recomendacao/sinais/conteudo.py`).
//
// For each Candidate linked to an entity (director, writer, actor, series,
// genre) of a film the Pessoa rated, two kinds of Evidence come out:
//
// - one per seed rating, with the strength of the rating ruler (its
//   percentile on the Pessoa's scale, and its age). A stated rating ("love" is 5, "hate" is 1) is a seed of Tipo
//   stated, or report when the Dono said it, with the stated ruler;
// - one of Tipo metadata for the entity, when there are high ratings, with
//   the strength of how many high ratings the Pessoa has on the same node.
//   A Nota is high by its percentile (`isHighRating`), a stated rating
//   when it is "ama" (5).
//
// A genre only gives the second, at most weak: a genre joins thousands of
// films, and one Evidence per rating in it would add dozens of Motivos that
// say little about the Candidate.
//
// Both stay under the link's ceiling (the ruler's `LINK_CEILING`). On the
// cast, the strength also depends on the actor's credit on the Candidate:
// outside the first 3 IMDb actor credits it is weak at most.
//
// The Pessoa's Ajuste [adjustment] to a link comes last: `none` removes the
// link's Evidence, `low` drops one level, and the level multiplies the
// weight (`[adjustment.level]`). A Declarado about the entity itself does
// not go through here (`stated.ts`) and takes no Ajuste.
//
// The links and their weights are `[path.weight]`, in file order.

import { Effect } from 'effect'
import {
  makeEvidence,
  contribution,
  type Evidence,
} from '../../evidence/Evidence.ts'
import {
  adjustedStrength,
  castStrength,
  HIGH_RATING,
  isHighRating,
  linkStrength,
  pathStrength,
  seedStrength,
  type RatingScale,
  type SeedKind,
} from '../../evidence/ruler.ts'
import type { Level, Link, Strength } from '../../evidence/strength.ts'
import { filmText, listText, seedText } from '../../evidence/wording.ts'
import { readRatingScale } from '../../people/rating-scale.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { num, numOrNull, text, textOrNull } from '../../sqlite/row.ts'
import type { Row } from '../../sqlite/Sqlite.ts'
import {
  kindOf,
  levelOf,
  LINK_PREDICATE,
  linkOf,
} from '../../sqlite/vocabulary.ts'
import { candidatesJson, type Signal } from './Signal.ts'

/** How each link reads. `seed` null: the link makes no seed Evidence. */
const WORDING: Readonly<
  Record<Link, { readonly seed: string | null; readonly node: string }>
> = {
  director: { seed: 'também de {}', node: 'dirigido por {}' },
  writer: { seed: 'também escrito por {}', node: 'escrito por {}' },
  cast: { seed: 'também com {}', node: 'com {} no elenco' },
  series: { seed: 'também da série {}', node: 'da série {}' },
  genre: { seed: null, node: 'do gênero {}' },
}

const isLink = (name: string): name is Link => name in WORDING

/** How many films the node's line names; above it, "entre eles". */
const LIST_MAX = 3

/** The Pessoa's Notas on films linked to each entity of the predicate. */
const SEEDS = `
SELECT s.entidade_id, s.filme_id, e.rotulo AS entidade,
       n.fato_id AS nota_fato, n.nota, n.data AS nota_data, n.fonte AS nota_fonte,
       n.tipo AS nota_tipo, n.sessao AS nota_sessao,
       f.titulo, f.ano
FROM notas_vigentes n
JOIN arestas s   ON s.filme_id = n.filme_id AND s.predicado = ?1
JOIN entidades e ON e.id = s.entidade_id
JOIN filmes f    ON f.id = n.filme_id
WHERE n.pessoa = ?2
ORDER BY s.entidade_id, n.nota DESC, f.titulo, f.ano, n.filme_id
`

/** The films linked to those entities that are still Candidates: the
 * path's Candidates. `?3` is the round's Candidate ids as a JSON list, so
 * the rest of the catalog never reaches JS. The `+` makes SQLite walk the
 * Candidates' edges (`arestas_por_filme`) and test the entity, which is
 * faster than walking every film of every entity the Pessoa rated.
 *
 * `principal` is for the cast only (null on the other links): whether the
 * actor is among the Candidate's first 3 IMDb credits (`elenco_principal`,
 * spelled out on its two tables so SQLite looks up the one pair instead of
 * building the whole view), and null when IMDb credits nobody on the film. */
const EDGES = `
SELECT c.filme_id AS candidato, c.entidade_id, c.fato_id, c.fonte, c.data,
       CASE WHEN ?1 = 'elenco' AND EXISTS (
           SELECT 1 FROM elenco_principal_imdb p WHERE p.filme_id = c.filme_id
       ) THEN EXISTS (
           SELECT 1 FROM elenco_principal_imdb p
           JOIN atores_imdb a ON a.imdb = p.ator_imdb
           WHERE p.filme_id = c.filme_id AND a.item = c.entidade_id
       ) END AS principal
FROM arestas c
WHERE c.predicado = ?1 AND +c.entidade_id IN (
    SELECT s.entidade_id FROM notas_vigentes n
    JOIN arestas s ON s.filme_id = n.filme_id AND s.predicado = ?1
    WHERE n.pessoa = ?2
) AND c.filme_id IN (SELECT value FROM json_each(?3))
ORDER BY c.filme_id, c.entidade_id
`

const fill = (template: string, entity: string): string =>
  template.replace('{}', () => entity)

/** A high seed: a Nota by its percentile, a stated rating by its value. */
const isHigh = (scale: RatingScale, seed: Row): boolean =>
  kindOf(text(seed, 'nota_tipo')) === 'rating'
    ? isHighRating(scale, num(seed, 'nota'))
    : num(seed, 'nota') >= HIGH_RATING

const highRatings = (high: ReadonlyArray<Row>): string => {
  const n = high.length
  const films = high
    .slice(0, LIST_MAX)
    .map((s) => filmText(text(s, 'titulo'), numOrNull(s, 'ano')))
  const start = `como ${n} ${n === 1 ? 'filme' : 'filmes'} a que deu Nota alta`
  return n > LIST_MAX
    ? `${start}, entre eles ${listText(films)}`
    : `${start}: ${listText(films)}`
}

export const content: Signal = {
  module: 'conteudo',
  forPerson: (round, person) =>
    Effect.gen(function* () {
      const { db, weights, today } = round
      const scale = yield* readRatingScale(db, person, weights)
      const out: Evidence[] = []
      const seeds = new Map<string, Evidence>()
      const adjustments = new Map<string, Level>()
      for (const row of yield* db.all(
        'SELECT elo, nivel FROM ajustes WHERE pessoa = ?',
        person,
      ))
        adjustments.set(
          linkOf(text(row, 'elo')) ?? text(row, 'elo'),
          levelOf(text(row, 'nivel')),
        )

      for (const [link, linkWeight] of Object.entries(weights.path.weight)) {
        if (!isLink(link)) {
          return yield* engineError(
            'invalid_config',
            `[path.weight] ${link}: o caminho de conteúdo não sabe redigir esse predicado`,
          )
        }
        const level = adjustments.get(link) ?? 'normal'
        if (level === 'none') continue
        const weight = linkWeight * weights.adjustment.level[level]
        const wording = WORDING[link]
        const params = [LINK_PREDICATE[link], person] as const

        const byEntity = new Map<string, Row[]>()
        for (const row of yield* db.all(SEEDS, ...params)) {
          const entity = text(row, 'entidade_id')
          byEntity.set(entity, [...(byEntity.get(entity) ?? []), row])
        }

        for (const edge of yield* db.all(
          EDGES,
          ...params,
          candidatesJson(round),
        )) {
          const candidate = text(edge, 'candidato')
          const linked = (byEntity.get(text(edge, 'entidade_id')) ?? []).filter(
            (s) => text(s, 'filme_id') !== candidate,
          )
          const [first] = linked
          if (first === undefined) continue
          const entity = text(first, 'entidade')
          const credited = numOrNull(edge, 'principal')
          const principal = credited === null ? null : credited !== 0
          const adjust = (strength: Strength): Strength =>
            adjustedStrength(castStrength(strength, principal), level) ??
            strength

          if (wording.seed !== null)
            for (const s of linked) {
              const kind = kindOf(text(s, 'nota_tipo')) as SeedKind
              const rating = num(s, 'nota')
              const date = text(s, 'nota_data')
              const [seedStrengthValue, direction] = seedStrength(
                kind,
                scale,
                rating,
                date,
                today,
                textOrNull(s, 'nota_sessao') !== null,
              )
              const start = seedText(
                kind,
                rating,
                filmText(text(s, 'titulo'), numOrNull(s, 'ano')),
              )
              const evidence = makeEvidence({
                person,
                filmId: candidate,
                text: `${start}, ${fill(wording.seed, entity)}`,
                source: text(s, 'nota_fonte'),
                date,
                strength: adjust(linkStrength(seedStrengthValue, link)),
                kind,
                factId: text(s, 'nota_fato'),
                base: weight * direction,
              })
              // The same Nota can reach the Candidate through more than one
              // node: the strongest link counts.
              const key = `${candidate}\0${text(s, 'nota_fato')}`
              const before = seeds.get(key)
              if (
                before === undefined ||
                Math.abs(contribution(evidence, weights)) >
                  Math.abs(contribution(before, weights))
              )
                seeds.set(key, evidence)
            }

          const high = linked.filter((s) => isHigh(scale, s))
          const nodeStrength = pathStrength(high.length, link)
          if (nodeStrength)
            out.push(
              makeEvidence({
                person,
                filmId: candidate,
                text: `${fill(wording.node, entity)}, ${highRatings(high)}`,
                source: text(edge, 'fonte'),
                date: text(edge, 'data'),
                strength: adjust(nodeStrength),
                kind: 'metadata',
                factId: text(edge, 'fato_id'),
                base: weight,
              }),
            )
        }
      }
      return [...out, ...seeds.values()]
    }),
}
