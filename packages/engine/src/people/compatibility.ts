// The Compatibilidade [compatibility] between Pessoas (#403, map #395): on
// her page, how close each other Pessoa rates the films both rated. Each
// Nota is read by its percentile on the Escala of whoever gave it, so
// someone who rates everything high and someone who rates low still agree
// when each puts the film at the same height of her own scale. The
// agreement is 1 minus the mean difference of those percentiles; only a
// Pessoa sharing `[compatibility] min_shared` films counts. Beside it, the
// films where the two agree and diverge most, never the same film in both.
//
// A picture for the page, as the taste summary: nothing here is Evidence.
// A pairwise answer's Nota stays out, as it does of the Escala.

import { Effect } from 'effect'
import type { RatingScale } from '../evidence/ruler.ts'
import { ratingPercentile } from '../evidence/ruler.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { num, numOrNull, text } from '../sqlite/row.ts'
import { readPeople, resolvePerson } from './people.ts'
import { readRatingScale } from './rating-scale.ts'

export interface CompatibilityRequest {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
}

/** A film both rated, with each one's Nota from 1 to 10. */
export interface CompatibilityFilm {
  readonly filmId: string
  readonly title: string
  readonly year: number | null
  /** Her Nota, the Pessoa of the page. */
  readonly mine: number
  /** The other Pessoa's. */
  readonly theirs: number
}

/** Her and another Pessoa. */
export interface PairCompatibility {
  readonly person: string
  readonly name: string
  /** Films both rated. */
  readonly shared: number
  /** 1 minus the mean difference of their percentiles, 0 to 1. */
  readonly agreement: number
  /** The closest films, closest first. */
  readonly agree: ReadonlyArray<CompatibilityFilm>
  /** The farthest films, farthest first. */
  readonly diverge: ReadonlyArray<CompatibilityFilm>
}

export interface Compatibility {
  readonly person: string
  /** The fewest films both rated for a Pessoa to count. */
  readonly minShared: number
  /** The other Pessoas that share enough films, most agreement first. */
  readonly others: ReadonlyArray<PairCompatibility>
}

/** Both Notas of each film the two rated, with its title (its id when
 * the Catálogo lacks it). */
const SHARED = `
SELECT a.filme_id, a.nota AS minha, b.nota AS dela,
  coalesce(f.titulo, a.filme_id) AS titulo, f.ano
FROM notas_vigentes a
JOIN notas_vigentes b ON b.filme_id = a.filme_id
LEFT JOIN filmes f ON f.id = a.filme_id
WHERE a.pessoa = ?1 AND b.pessoa = ?2
  AND a.tipo = 'nota' AND NOT a.par_a_par
  AND b.tipo = 'nota' AND NOT b.par_a_par
ORDER BY a.filme_id
`

interface SharedFilm extends CompatibilityFilm {
  /** The difference of the two percentiles, 0 to 1. */
  readonly gap: number
  /** Their mean percentile: between two films as close, the one both
   * liked more agrees first. */
  readonly height: number
}

/** The two farthest ends of the films, `films` from each, never one film
 * in both. */
const ends = (
  shared: ReadonlyArray<SharedFilm>,
  films: number,
): Pick<PairCompatibility, 'agree' | 'diverge'> => {
  const side = Math.min(films, Math.floor(shared.length / 2))
  const film = ({ gap: _gap, height: _height, ...f }: SharedFilm) => f
  const closest = [...shared].sort(
    (a, b) => a.gap - b.gap || b.height - a.height,
  )
  const farthest = [...shared].sort(
    (a, b) => b.gap - a.gap || b.height - a.height,
  )
  return {
    agree: closest.slice(0, side).map(film),
    diverge: farthest.slice(0, side).map(film),
  }
}

const pair = (
  db: Connection,
  slug: string,
  scale: RatingScale,
  other: { readonly slug: string; readonly name: string },
  otherScale: RatingScale,
  films: number,
) =>
  Effect.map(db.all(SHARED, slug, other.slug), (rows): PairCompatibility => {
    const shared = rows.map((row): SharedFilm => {
      const mine = num(row, 'minha')
      const theirs = num(row, 'dela')
      const [p, q] = [
        ratingPercentile(scale, mine),
        ratingPercentile(otherScale, theirs),
      ]
      return {
        filmId: text(row, 'filme_id'),
        title: text(row, 'titulo'),
        year: numOrNull(row, 'ano'),
        mine: 2 * mine,
        theirs: 2 * theirs,
        gap: Math.abs(p - q),
        height: (p + q) / 2,
      }
    })
    // NaN with no film shared: below the minimum, it never leaves.
    const gaps = shared.reduce((sum, f) => sum + f.gap, 0)
    return {
      person: other.slug,
      name: other.name,
      shared: shared.length,
      agreement: 1 - gaps / shared.length,
      ...ends(shared, films),
    }
  })

/** Her Compatibilidade with each other Pessoa. Fails `unknown_person` on
 * a name of no one. */
export const personCompatibility = (
  request: CompatibilityRequest,
): Effect.Effect<
  Compatibility,
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
    const person = yield* resolvePerson(request.person)
    const people = yield* readPeople
    const { weights } = yield* Environment
    const { min_shared: minShared, films } = weights.compatibility
    const others = yield* (yield* Sqlite).read((db) =>
      Effect.gen(function* () {
        const scale = yield* readRatingScale(db, person.slug, weights)
        return yield* Effect.forEach(
          people.filter((p) => p.slug !== person.slug),
          (other) =>
            Effect.flatMap(readRatingScale(db, other.slug, weights), (s) =>
              pair(db, person.slug, scale, other, s, films),
            ),
        )
      }),
    )
    return {
      person: person.slug,
      minShared,
      // The sort is stable: a tie keeps the order of the files, by slug.
      others: others
        .filter((o) => o.shared >= Math.max(1, minShared))
        .sort((a, b) => b.agreement - a.agreement),
    }
  })
