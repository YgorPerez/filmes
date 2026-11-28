// The pull of a Clima of popularity, conhecido or desconhecido (#387): a
// film line from the film's IMDb votes, with no tags or genres. The votes
// sit on a log scale between `[popularity] votes_low` and `votes_high`
// (#386); conhecido pulls the films above its middle (31,623 votes with
// 1,000 and 1,000,000), desconhecido those below, and a film at the middle
// gets no line. The scale is fixed, not a percentile over the Round's
// Candidates: those already passed the Vetos and Restrições, and the pull
// would change with an unrelated "nada de terror".

import { factId, pyInt } from '../../compat/fact-id.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import { popularityStrength } from '../../evidence/ruler.ts'
import { integerText } from '../../evidence/wording.ts'
import type { Popularity } from '../moods.ts'
import type { Round } from './Signal.ts'

/** The `fato_id` prefix of the line. */
const POPULARITY_TABLE = 'popularidade'

/** How far the film answers the Clima, from 0 to 1. */
const pull = (
  popularity: Popularity,
  votes: number,
  { votes_low: low, votes_high: high }: Round['weights']['popularity'],
): number => {
  const scale =
    (Math.log10(votes) - Math.log10(low)) / (Math.log10(high) - Math.log10(low))
  const position = Math.min(1, Math.max(0, scale))
  return Math.max(
    0,
    popularity === 'known' ? 2 * position - 1 : 1 - 2 * position,
  )
}

/** The Clima's line for each Candidate that answers it. */
export const popularityLines = (
  round: Round,
  name: string,
  popularity: Popularity,
): Evidence[] => {
  const weights = round.weights.popularity
  const out: Evidence[] = []
  for (const [filmId, film] of round.candidates) {
    const share = pull(popularity, film.votes, weights)
    if (share <= 0 || weights.weight === 0) continue
    out.push(
      makeEvidence({
        person: null,
        filmId,
        text: `Clima ${name}: ${integerText(film.votes)} votos no IMDb`,
        source: 'IMDb',
        date: film.imdbVotesDate,
        strength: popularityStrength(),
        kind: 'metadata',
        factId: factId(POPULARITY_TABLE, filmId, popularity, pyInt(film.votes)),
        base: weights.weight * share,
        countsAsFact: false,
      }),
    )
  }
  return out
}
