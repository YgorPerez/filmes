// Candidatos [candidates]: the Catálogo's films with enough IMDb votes and a
// high enough IMDb rating (`recomendacao/candidatos.py`). Vetos and
// Restrições remove films from here, before any ordering.

import { Effect, Schema } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

/** A row of `filmes`, the derived database's Portuguese columns. */
const FilmRow = Schema.Struct({
  id: Schema.String,
  titulo: Schema.String,
  ano: Schema.NullOr(Schema.Int),
  duracao_min: Schema.NullOr(Schema.Int),
  votos: Schema.Int,
  nota_imdb: Schema.NullOr(Schema.Finite),
  data_imdb: Schema.NullOr(Schema.String),
  data_votos_imdb: Schema.NullOr(Schema.String),
})

export interface Candidate {
  /** The IMDb tconst. */
  readonly id: string
  readonly title: string
  readonly year: number | null
  readonly runtimeMinutes: number | null
  /** IMDb numVotes. */
  readonly votes: number
  readonly imdbRating: number | null
  readonly imdbDate: string | null
  readonly imdbVotesDate: string | null
}

const decodeFilms = Schema.decodeUnknownEffect(Schema.Array(FilmRow))
const decodeFilm = Schema.decodeUnknownEffect(FilmRow)

/** The Candidates, by id in id order. A film with no IMDb rating is not cut
 * by the rating; in the real Catálogo every film has one. */
export const chooseCandidates = (
  db: Connection,
  weights: Pick<Weights, 'catalog'>,
): Effect.Effect<ReadonlyMap<string, Candidate>, SqliteError> =>
  db
    .all(
      'SELECT * FROM filmes WHERE votos >= ? AND (nota_imdb IS NULL OR nota_imdb >= ?) ORDER BY id',
      weights.catalog.min_votes,
      weights.catalog.min_imdb_rating,
    )
    .pipe(
      Effect.flatMap((rows) => Effect.orDie(decodeFilms(rows))),
      Effect.map(
        (rows) =>
          new Map(
            rows.map((row): [string, Candidate] => [row.id, toCandidate(row)]),
          ),
      ),
    )

const toCandidate = (row: typeof FilmRow.Type): Candidate => ({
  id: row.id,
  title: row.titulo,
  year: row.ano,
  runtimeMinutes: row.duracao_min,
  votes: row.votos,
  imdbRating: row.nota_imdb,
  imdbDate: row.data_imdb,
  imdbVotesDate: row.data_votos_imdb,
})

/** A film of the Catálogo by id, Candidate or not; undefined when it is
 * not there. */
export const catalogFilm = (
  db: Connection,
  id: string,
): Effect.Effect<Candidate | undefined, SqliteError> =>
  Effect.gen(function* () {
    const row = yield* db.get('SELECT * FROM filmes WHERE id = ?', id)
    if (row === undefined) return undefined
    return toCandidate(yield* Effect.orDie(decodeFilm(row)))
  })

/** The Candidates and their ids from the most voted, reused across the
 * rounds of `avaliar` (Python's `Selecao`). */
export interface CandidateSelection {
  readonly films: ReadonlyMap<string, Candidate>
  /** Most votes first; on a tie, by id. */
  readonly popular: ReadonlyArray<string>
}

export const prepareSelection = (
  db: Connection,
  weights: Pick<Weights, 'catalog'>,
): Effect.Effect<CandidateSelection, SqliteError> =>
  Effect.map(chooseCandidates(db, weights), (films) => ({
    films,
    popular: [...films.values()]
      .sort((a, b) => compareTuple([-a.votes, a.id], [-b.votes, b.id]))
      .map((film) => film.id),
  }))
