// A film line from MovieLens tags, the Tag Genome or a genre
// (`recomendacao/sinais/_tags.py`). The Clima and the group-or-alone
// signals share it: for a set of tags (and, for a Clima, genres), each
// Candidate gets at most one Evidence, the strongest it finds. A film with
// five tags of the same Clima does not get five bonuses. On equal strength,
// tags.csv before the genome, the genome before the genre, then the larger
// count or relevance.

import { Effect } from 'effect'
import { compareTuple, type PyOrderable } from '../../compat/compare.ts'
import { truncate2 } from '../../compat/number.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import {
  GENOME_MIN_RELEVANCE,
  genomeStrength,
  MOVIELENS_TAG_MIN_USERS,
  moodGenreStrength,
  movielensTagStrength,
} from '../../evidence/ruler.ts'
import { STRENGTHS } from '../../evidence/strength.ts'
import { integerText } from '../../evidence/wording.ts'
import { num, text } from '../../sqlite/row.ts'
import type { SqliteError } from '../../sqlite/Sqlite.ts'
import { candidatesJson, type Round } from './Signal.ts'

const marks = (values: ReadonlyArray<unknown>): string =>
  values.map(() => '?').join(',')

/** Candidate → the strongest Evidence among the given tags and genres. */
export const strongest = (
  round: Round,
  label: string,
  tags: ReadonlyArray<string>,
  genres: ReadonlyArray<string> = [],
  weight = 1.0,
): Effect.Effect<ReadonlyArray<Evidence>, SqliteError> =>
  Effect.gen(function* () {
    // Each query asks SQL for the Candidates' rows only, and only for the
    // tags strong enough to give Evidence: the rest never reach JS. The
    // `+` keeps SQLite on the tag (or genre) index, with the Candidates as
    // a membership test; driving from the Candidates is slower here.
    const candidates = candidatesJson(round)
    const found = new Map<string, readonly [PyOrderable[], Evidence]>()
    const consider = (evidence: Evidence, tieBreak: PyOrderable[]) => {
      const key = [STRENGTHS.indexOf(evidence.strength), ...tieBreak]
      const current = found.get(evidence.filmId)
      if (current === undefined || compareTuple(key, current[0]) > 0)
        found.set(evidence.filmId, [key, evidence])
    }

    for (const row of yield* round.db.all(
      `SELECT * FROM tags_movielens WHERE tag IN (${marks(tags)}) AND usuarios >= ? AND +filme_id IN (SELECT value FROM json_each(?)) ORDER BY filme_id, tag`,
      ...tags,
      MOVIELENS_TAG_MIN_USERS,
      candidates,
    )) {
      const users = num(row, 'usuarios')
      const strength = movielensTagStrength(users)
      if (strength)
        consider(
          makeEvidence({
            person: null,
            filmId: text(row, 'filme_id'),
            strength,
            kind: 'review',
            text: `${label}: ${integerText(users)} usuários do MovieLens marcaram o filme com a tag "${text(row, 'tag')}"`,
            source: text(row, 'fonte'),
            date: text(row, 'data'),
            factId: text(row, 'fato_id'),
            base: weight,
          }),
          [2, users, text(row, 'tag')],
        )
    }

    for (const row of yield* round.db.all(
      `SELECT * FROM genoma WHERE tag IN (${marks(tags)}) AND relevancia >= ? AND +filme_id IN (SELECT value FROM json_each(?)) ORDER BY filme_id, tag`,
      ...tags,
      GENOME_MIN_RELEVANCE,
      candidates,
    )) {
      const relevance = num(row, 'relevancia')
      const strength = genomeStrength(relevance)
      if (strength)
        consider(
          makeEvidence({
            person: null,
            filmId: text(row, 'filme_id'),
            strength,
            kind: 'review',
            // Two places cut, not rounded: 0.799 reads "0,79", below the
            // 0.80 threshold of the ruler, as the line's strength.
            text: `${label}: relevância ${truncate2(relevance)} da tag "${text(row, 'tag')}" para o filme no Tag Genome`,
            source: text(row, 'fonte'),
            date: text(row, 'data'),
            factId: text(row, 'fato_id'),
            base: weight,
          }),
          [1, relevance, text(row, 'tag')],
        )
    }

    if (genres.length > 0)
      for (const row of yield* round.db.all(
        `SELECT a.filme_id, a.fato_id, a.fonte, a.data, e.rotulo FROM arestas a
         JOIN entidades e ON e.id = a.entidade_id
         WHERE a.predicado = 'genero' AND a.entidade_id IN (${marks(genres)})
           AND +a.filme_id IN (SELECT value FROM json_each(?))
         ORDER BY a.filme_id, e.rotulo`,
        ...genres,
        candidates,
      ))
        consider(
          makeEvidence({
            person: null,
            filmId: text(row, 'filme_id'),
            strength: moodGenreStrength(),
            kind: 'metadata',
            text: `${label}: do gênero ${text(row, 'rotulo')}`,
            source: text(row, 'fonte'),
            date: text(row, 'data'),
            factId: text(row, 'fato_id'),
            base: weight,
          }),
          [0, 0, text(row, 'rotulo')],
        )

    return [...found.values()].map(([, evidence]) => evidence)
  })
