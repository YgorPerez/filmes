// MovieLens item-item neighbourhood: a Pessoa's Nota → MovieLens neighbour →
// Candidate (`recomendacao/sinais/vizinhanca.py`).
//
// Each Nota in favour of the Pessoa on a film X (by its percentile on her
// scale), or her stated "ama", is a seed.
// For each neighbour Y of X that is a Candidate, one review Evidence: "deu 5
// a X, e de 3.104 pessoas que deram 4+ a ele, 64% deram 4+ a este". The
// strength comes from the base and the share, capped by the seed's
// strength. A stated rating opens the line as on the content path and has
// the stated seed strength. A rating against is not a seed: liking Y when
// you liked X says nothing about someone who did not like X.

import { Effect } from 'effect'
import { makeEvidence } from '../../evidence/Evidence.ts'
import {
  neighborStrength,
  seedStrength,
  type SeedKind,
} from '../../evidence/ruler.ts'
import { filmText, integerText, seedText } from '../../evidence/wording.ts'
import { readRatingScale } from '../../people/rating-scale.ts'
import { num, numOrNull, text, textOrNull } from '../../sqlite/row.ts'
import { kindOf } from '../../sqlite/vocabulary.ts'
import { candidatesJson, type Signal } from './Signal.ts'

/** The neighbours of the Pessoa's Notas that are Candidates. The `+`
 * keeps SQLite on the Notas (vizinhos has no index on `vizinho_id`), with
 * the Candidates as a membership test. */
const NEIGHBORS = `
SELECT v.vizinho_id AS candidato, v.fato_id, v.base, v.ambos, v.fonte, v.data,
       n.nota, n.data AS nota_data, n.sessao, n.fonte AS nota_fonte, n.tipo AS nota_tipo, f.titulo, f.ano
FROM notas_vigentes n
JOIN vizinhos v ON v.filme_id = n.filme_id
JOIN filmes f   ON f.id = n.filme_id
WHERE n.pessoa = ?1 AND +v.vizinho_id IN (SELECT value FROM json_each(?2))
ORDER BY v.vizinho_id, v.fato_id
`

export const neighbors: Signal = {
  module: 'vizinhanca',
  forPerson: (round, person) =>
    Effect.gen(function* () {
      const scale = yield* readRatingScale(round.db, person, round.weights)
      const rows = yield* round.db.all(NEIGHBORS, person, candidatesJson(round))
      return rows.flatMap((row) => {
        const candidate = text(row, 'candidato')
        const kind = kindOf(text(row, 'nota_tipo')) as SeedKind
        const [seed, direction] = seedStrength(
          kind,
          scale,
          num(row, 'nota'),
          text(row, 'nota_data'),
          round.today,
          {
            fromFeedback: textOrNull(row, 'sessao') !== null,
            source: text(row, 'nota_fonte'),
          },
        )
        if (direction < 0) return []
        const base = num(row, 'base')
        const both = num(row, 'ambos')
        const strength = neighborStrength(base, both, seed)
        if (strength === null) return []
        const film = filmText(text(row, 'titulo'), numOrNull(row, 'ano'))
        return [
          makeEvidence({
            person,
            filmId: candidate,
            text:
              `${seedText(kind, num(row, 'nota'), film)}, ` +
              `e de ${integerText(base)} pessoas que deram 4+ a ele, ` +
              `${Math.floor((100 * both) / base)}% deram 4+ a este`,
            source: text(row, 'fonte'),
            date: text(row, 'data'),
            strength,
            kind: 'review',
            factId: text(row, 'fato_id'),
            base: round.weights.neighbors.weight,
          }),
        ]
      })
    }),
}
