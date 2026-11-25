// `70_parecenca`: the similarity precompute (schema in `51_parecenca.sql`):
// each tag's mean over the genome, each MovieLens tag's rarity, and the norm
// of each film's MovieLens tag vector. `ln` is the connection's function
// (`sqlite/functions.ts`), as Python registered `math.log`.

import { Effect } from 'effect'
import { num, text } from '../../sqlite/row.ts'
import type { Step } from './Step.ts'

export const similarity: Step = {
  name: '70_parecenca',
  load: (db) =>
    Effect.gen(function* () {
      yield* db.run(`
        INSERT INTO tags_no_catalogo (fonte, tag, valor)
        SELECT 'genoma', tag, sum(relevancia) * 1.0 / (SELECT count(DISTINCT filme_id) FROM genoma)
        FROM genoma GROUP BY tag`)
      yield* db.run(`
        INSERT INTO tags_no_catalogo (fonte, tag, valor)
        SELECT 'tags_movielens', tag, ln((SELECT count(DISTINCT filme_id) FROM tags_movielens) * 1.0 / count(*))
        FROM tags_movielens GROUP BY tag`)
      const norms = new Map<string, number>()
      for (const row of yield* db.all(`
            SELECT t.filme_id, t.usuarios, r.valor FROM tags_movielens t
            JOIN tags_no_catalogo r ON r.fonte = 'tags_movielens' AND r.tag = t.tag
            ORDER BY t.filme_id, t.tag`)) {
        const film = text(row, 'filme_id')
        const term = Math.log1p(num(row, 'usuarios')) * num(row, 'valor')
        norms.set(film, (norms.get(film) ?? 0) + term * term)
      }
      for (const [film, square] of norms)
        yield* db.run(
          'INSERT INTO normas_tags_movielens (filme_id, norma) VALUES (?, ?)',
          film,
          Math.sqrt(square),
        )
    }),
}
