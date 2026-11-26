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
import type { Row, SqliteError } from '../../sqlite/Sqlite.ts'
import { candidatesJson, type Round } from './Signal.ts'

const marks = (values: ReadonlyArray<unknown>): string =>
  values.map(() => '?').join(',')

/** A query over the tag (or genre) rows of the Candidates. */
interface TagQuery {
  readonly round: Round
  readonly label: string
  readonly weight: number
  /** The Candidates' ids, as `candidatesJson`. */
  readonly candidates: string
  readonly consider: (evidence: Evidence, tieBreak: PyOrderable[]) => void
}

/** A film line of a tag (or genre) row, with its Fact's source, date and
 * id. */
const tagLine = (
  query: TagQuery,
  row: Row,
  line: Pick<Evidence, 'strength' | 'kind' | 'text'>,
): Evidence =>
  makeEvidence({
    person: null,
    filmId: text(row, 'filme_id'),
    ...line,
    source: text(row, 'fonte'),
    date: text(row, 'data'),
    factId: text(row, 'fato_id'),
    base: query.weight,
  })

const movielensTags = (query: TagQuery, tags: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    for (const row of yield* query.round.db.all(
      `SELECT * FROM tags_movielens WHERE tag IN (${marks(tags)}) AND usuarios >= ? AND +filme_id IN (SELECT value FROM json_each(?)) ORDER BY filme_id, tag`,
      ...tags,
      MOVIELENS_TAG_MIN_USERS,
      query.candidates,
    )) {
      const users = num(row, 'usuarios')
      const strength = movielensTagStrength(users)
      if (strength)
        query.consider(
          tagLine(query, row, {
            strength,
            kind: 'review',
            text: `${query.label}: ${integerText(users)} usuários do MovieLens marcaram o filme com a tag "${text(row, 'tag')}"`,
          }),
          [2, users, text(row, 'tag')],
        )
    }
  })

const genomeTags = (query: TagQuery, tags: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    for (const row of yield* query.round.db.all(
      `SELECT * FROM genoma WHERE tag IN (${marks(tags)}) AND relevancia >= ? AND +filme_id IN (SELECT value FROM json_each(?)) ORDER BY filme_id, tag`,
      ...tags,
      GENOME_MIN_RELEVANCE,
      query.candidates,
    )) {
      const relevance = num(row, 'relevancia')
      const strength = genomeStrength(relevance)
      if (strength)
        query.consider(
          tagLine(query, row, {
            strength,
            kind: 'review',
            // Two places cut, not rounded: 0.799 reads "0,79", below the
            // 0.80 threshold of the ruler, as the line's strength.
            text: `${query.label}: relevância ${truncate2(relevance)} da tag "${text(row, 'tag')}" para o filme no Tag Genome`,
          }),
          [1, relevance, text(row, 'tag')],
        )
    }
  })

const genreLines = (query: TagQuery, genres: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    for (const row of yield* query.round.db.all(
      `SELECT a.filme_id, a.fato_id, a.fonte, a.data, e.rotulo FROM arestas a
         JOIN entidades e ON e.id = a.entidade_id
         WHERE a.predicado = 'genero' AND a.entidade_id IN (${marks(genres)})
           AND +a.filme_id IN (SELECT value FROM json_each(?))
         ORDER BY a.filme_id, e.rotulo`,
      ...genres,
      query.candidates,
    ))
      query.consider(
        tagLine(query, row, {
          strength: moodGenreStrength(),
          kind: 'metadata',
          text: `${query.label}: do gênero ${text(row, 'rotulo')}`,
        }),
        [0, 0, text(row, 'rotulo')],
      )
  })

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
    const found = new Map<string, readonly [PyOrderable[], Evidence]>()
    const query: TagQuery = {
      round,
      label,
      weight,
      candidates: candidatesJson(round),
      consider: (evidence, tieBreak) => {
        const key = [STRENGTHS.indexOf(evidence.strength), ...tieBreak]
        const current = found.get(evidence.filmId)
        if (current === undefined || compareTuple(key, current[0]) > 0)
          found.set(evidence.filmId, [key, evidence])
      },
    }
    yield* movielensTags(query, tags)
    yield* genomeTags(query, tags)
    if (genres.length > 0) yield* genreLines(query, genres)
    return [...found.values()].map(([, evidence]) => evidence)
  })
