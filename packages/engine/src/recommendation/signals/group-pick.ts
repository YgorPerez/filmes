// Escolha de grupo [group pick] → MovieLens neighbour → Candidate (#415).
//
// Each film of a group the Pessoa picked on the Link da Sessão is a seed of
// the MovieLens neighbourhood, like a Nota in her favour
// (`neighbors.ts`), but weak (`groupPickStrength`): she said the group is
// most like her, not that she saw or liked the film. For each neighbour Y
// of a group's film X that is a Candidate, one review Evidence: "escolheu o
// grupo de Up, Amélie e A Vida É Bela; das 3.104 pessoas que deram 8 ou
// mais a Up (2009), 64% fizeram o mesmo com este". No Decaimento: a pick is
// no Nota.
//
// A film she has a Nota for seeds through her Nota instead; a film in two
// of her picks seeds once, by the latest.

import { Effect } from 'effect'
import { makeEvidence } from '../../evidence/Evidence.ts'
import { groupPickStrength, neighborStrength } from '../../evidence/ruler.ts'
import { filmText, groupPickText } from '../../evidence/wording.ts'
import { num, numOrNull, text } from '../../sqlite/row.ts'
import { candidatesJson, type Signal } from './Signal.ts'

/** Each pick's films, with their titles, in order. */
const PICKS = `
SELECT e.fato_id, e.filme_id, e.ordem, COALESCE(f.titulo, e.filme_id) AS titulo, f.ano
FROM escolhas_de_grupo e LEFT JOIN filmes f ON f.id = e.filme_id
WHERE e.pessoa = ?
ORDER BY e.data DESC, e.fato_id, e.ordem
`

/** The neighbours of the seed films that are Candidates. */
const NEIGHBORS = `
SELECT v.filme_id AS semente, v.vizinho_id AS candidato, v.fato_id, v.base, v.ambos, v.fonte, v.data
FROM vizinhos v
WHERE v.filme_id IN (SELECT value FROM json_each(?1))
  AND +v.vizinho_id IN (SELECT value FROM json_each(?2))
ORDER BY v.vizinho_id, v.fato_id
`

interface Seed {
  /** The group's films' titles, for the line. */
  readonly titles: ReadonlyArray<string>
  /** The seed film, with its year. */
  readonly film: string
}

export const groupPick: Signal = {
  module: 'escolha_de_grupo',
  forPerson: (round, person) =>
    Effect.gen(function* () {
      const rows = yield* round.db.all(PICKS, person)
      if (rows.length === 0) return []
      const rated = new Set(
        (yield* round.db.all(
          'SELECT filme_id FROM notas_vigentes WHERE pessoa = ?',
          person,
        )).map((row) => text(row, 'filme_id')),
      )
      const titles = new Map<string, string[]>()
      for (const row of rows) {
        const id = text(row, 'fato_id')
        titles.set(id, [...(titles.get(id) ?? []), text(row, 'titulo')])
      }
      // The latest pick of each film, as the rows come.
      const seeds = new Map<string, Seed>()
      for (const row of rows) {
        const film = text(row, 'filme_id')
        if (rated.has(film) || seeds.has(film)) continue
        seeds.set(film, {
          titles: titles.get(text(row, 'fato_id'))!,
          film: filmText(text(row, 'titulo'), numOrNull(row, 'ano')),
        })
      }
      if (seeds.size === 0) return []
      const neighbors = yield* round.db.all(
        NEIGHBORS,
        JSON.stringify([...seeds.keys()]),
        candidatesJson(round),
      )
      return neighbors.flatMap((row) => {
        const seed = seeds.get(text(row, 'semente'))!
        const base = num(row, 'base')
        const both = num(row, 'ambos')
        const strength = neighborStrength(base, both, groupPickStrength())
        if (strength === null) return []
        return [
          makeEvidence({
            person,
            filmId: text(row, 'candidato'),
            text: groupPickText(seed.titles, seed.film, base, both),
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
