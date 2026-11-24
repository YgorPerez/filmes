// Evidência [Evidence]: the use of a Fato as a Motivo, with a Força and a
// Tipo (`evidencia/__init__.py`).
//
// The strength comes only from the ruler (`ruler.ts`). The recommendation
// signals make Evidence with a `base` (a signed weight: positive for the
// film, negative against); its contribution to the order is `base` times the
// strength's multiplier in `weights.toml`.

import { pyRound } from '../compat/number.ts'
import type { Weights } from '../runtime/Weights.ts'
import { guessStrength, requestMetadataStrength } from './ruler.ts'
import type { Kind, Strength } from './strength.ts'

export interface Evidence {
  /** `null`: a film line (duration, rating...), about no Presente. */
  readonly person: string | null
  readonly filmId: string
  readonly text: string
  /** `null` only on a guess. */
  readonly source: string | null
  readonly date: string | null
  readonly strength: Strength
  readonly kind: Kind
  readonly factId: string | null
  readonly base: number
  /** A Já visto [seen]: outside the cut of the strongest, always counts. */
  readonly seen: boolean
  /** `false`: only moves the order; a film with only this is still "só
   * palpites". */
  readonly countsAsFact: boolean
}

/** An Evidence; `seen` is false and `countsAsFact` true unless given. */
export const makeEvidence = (
  fields: Omit<Evidence, 'seen' | 'countsAsFact'> &
    Partial<Pick<Evidence, 'seen' | 'countsAsFact'>>,
): Evidence => ({ seen: false, countsAsFact: true, ...fields })

/** What an Evidence adds to the order: `base` times the multiplier of its
 * strength, or of `guess` for a guess. */
export const contribution = (
  evidence: Evidence,
  weights: Pick<Weights, 'strength'>,
): number =>
  evidence.base *
  weights.strength.multiplier[
    evidence.kind === 'guess' ? 'guess' : evidence.strength
  ]

/** An Evidence as the result prints it. */
export interface EvidenceJson {
  readonly person: string | null
  readonly text: string
  readonly source: string | null
  readonly date: string | null
  readonly strength: Strength
  readonly kind: Kind
  readonly factId: string | null
  /** Rounded to 4 places. */
  readonly contribution: number
}

export const evidenceToJson = (
  evidence: Evidence,
  weights: Pick<Weights, 'strength'>,
): EvidenceJson => ({
  person: evidence.person,
  text: evidence.text,
  source: evidence.source,
  date: evidence.date,
  strength: evidence.strength,
  kind: evidence.kind,
  factId: evidence.factId,
  contribution: pyRound(contribution(evidence, weights), 4),
})

/** The line of a Presente with no Fact about the film: a guess, the
 * ruler's strength, adds 0. */
export const withoutFact = (person: string, filmId: string): Evidence =>
  makeEvidence({
    person,
    filmId,
    text: 'sem fato',
    source: null,
    date: null,
    strength: guessStrength(),
    kind: 'guess',
    factId: null,
    base: 0,
  })

/** The film line of a Restrição the film passed: metadata that answers the
 * request (duration, language, rating, trigger), the ruler's strength,
 * adds 0. */
export const requestLine = (
  filmId: string,
  text: string,
  source: string,
  date: string,
  factId: string,
): Evidence =>
  makeEvidence({
    person: null,
    filmId,
    text,
    source,
    date,
    strength: requestMetadataStrength(),
    kind: 'metadata',
    factId,
    base: 0,
  })
