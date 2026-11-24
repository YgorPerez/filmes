// Declarados and Relatos about an entity: "adoro os filmes da Sofia Rangel"
// (`recomendacao/sinais/declarados.py`).
//
// Each Declarado or Relato with a reaction becomes Evidence on each
// Candidate linked to the entity by some edge. The strength comes from the
// ruler (specific or generic, Declarado or Relato, age); the base is
// `[people] statement_weight`, signed by the reaction.
//
// The ones about a film do not come here: with love or hate they become a
// stated Nota and enter the content path as a seed.

import { Effect } from 'effect'
import { pythonError } from '../../compat/python-error.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import { statedStrength } from '../../evidence/ruler.ts'
import { num, text } from '../../sqlite/row.ts'
import type { Signal } from './Signal.ts'

/** The stored `reacao` and its direction. */
const DIRECTION: Readonly<Record<string, 1 | -1>> = {
  ama: 1,
  gosta: 1,
  nao_gosta: -1,
  odeia: -1,
}

/** How the Candidate's link to the entity reads, by stored predicate; any
 * other predicate reads "<predicado>: <entidade>". */
const LINK: Readonly<Record<string, string>> = {
  diretor: 'dirigido por {}',
  elenco: 'com {} no elenco',
  genero: 'do gênero {}',
}

const TABLES = [
  { table: 'declarados', kind: 'stated', opening: 'disse "{}"' },
  { table: 'relatos', kind: 'report', opening: 'segundo o Dono, "{}"' },
] as const

const linkText = (predicate: string, entity: string): string =>
  (LINK[predicate] ?? `${predicate}: {}`).replace('{}', () => entity)

export const stated: Signal = {
  module: 'declarados',
  forPerson: (round, person) =>
    Effect.gen(function* () {
      const weight = round.weights.people.statement_weight
      const out: Evidence[] = []
      for (const { table, kind, opening } of TABLES) {
        const seen = new Set<string>()
        for (const row of yield* round.db.all(
          `SELECT d.fato_id, d.data, d.fonte, d.especifico, d.reacao, d.texto,
                  a.filme_id, a.predicado, e.rotulo AS entidade
           FROM ${table} d
           JOIN arestas a   ON a.entidade_id = d.alvo
           JOIN entidades e ON e.id = d.alvo
           WHERE d.pessoa = ? AND d.reacao IS NOT NULL
           ORDER BY d.fato_id, a.filme_id, a.predicado`,
          person,
        )) {
          const filmId = text(row, 'filme_id')
          const key = `${text(row, 'fato_id')}\0${filmId}`
          if (!round.candidates.has(filmId) || seen.has(key)) continue
          seen.add(key)
          const reaction = text(row, 'reacao')
          const direction = DIRECTION[reaction]
          if (direction === undefined)
            throw pythonError('KeyError', `'${reaction}'`)
          out.push(
            makeEvidence({
              person,
              filmId,
              text: `${opening.replace('{}', () => text(row, 'texto'))}; ${linkText(text(row, 'predicado'), text(row, 'entidade'))}`,
              source: text(row, 'fonte'),
              date: text(row, 'data'),
              strength: statedStrength(
                kind,
                num(row, 'especifico') !== 0,
                text(row, 'data'),
                round.today,
              ),
              kind,
              factId: text(row, 'fato_id'),
              base: weight * direction,
            }),
          )
        }
      }
      return out
    }),
}
