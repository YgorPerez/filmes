// The Motivo [reason] of a recommended film (#183): what its strongest
// Evidence for it says, in a word the Cartaz can put a title on.
//
// The Evidence lines are read back from their wording, which lives with each
// path: the content path (`signals/content.ts`: "dirigido por X, como 3
// filmes a que deu nota alta" and "deu 5 a F, também de X"; "com fotografia
// de X" goes before "com X" and its "também com X"), Declarados and
// Relatos about an entity (`signals/stated.ts`: `disse "..."; dirigido por
// X`), the MovieLens neighbours (`signals/neighbors.ts`: "deu 5 a F; das
// 1.000 pessoas...") and the taste neighbours (`wording.ts`). Any other line
// (Já visto, a film line, a guess) is no Motivo.
//
// Only Evidence for the film counts: its contribution is positive. The
// strongest wins; on a tie, the first Presente's, then her first line. The
// Presentes who share a Motivo are every one with a line for the film that
// reads as the same Motivo.

import type { EvidenceJson } from '../evidence/Evidence.ts'

/** What a film's Motivo is about: an entity she likes ("Christopher
 * Nolan", "faroeste"), a film she liked ("Fronteira (2008)") or her taste
 * neighbours. */
export type ReasonKind = 'entity' | 'film' | 'taste'

export interface FilmReason {
  readonly kind: ReasonKind
  /** The entity or the film; none for the taste neighbours. */
  readonly name?: string
  /** The Presentes (slugs) with the Motivo, in the Presentes' order. */
  readonly people: ReadonlyArray<string>
}

type Line = Pick<EvidenceJson, 'text' | 'kind' | 'contribution'>

const SEED = String.raw`(?:deu [\d,]+ a|disse que ama|segundo o Dono, ama)`
const HIGH = String.raw`como \d+ filmes? a que deu nota alta`

/** Each wording and what it is about, the more specific first. */
const READINGS: ReadonlyArray<readonly [RegExp, ReasonKind]> = [
  [
    new RegExp(
      String.raw`^${SEED} (.+); das [\d.]+ pessoas que deram 4 ou mais a ele, \d+% fizeram o mesmo com este$`,
      'u',
    ),
    'film',
  ],
  [/^[\d.]+ pessoas de gosto parecido deram /u, 'taste'],
  [
    new RegExp(
      String.raw`^${SEED} .+, também (?:de|escrito por|com fotografia de|produzido por|com|da série) (.+)$`,
      'u',
    ),
    'entity',
  ],
  [
    new RegExp(
      String.raw`^(?:dirigido por|escrito por|da série|do gênero|com fotografia de|produzido por) (.+?), ${HIGH}`,
      'u',
    ),
    'entity',
  ],
  [new RegExp(String.raw`^com (.+?) no elenco, ${HIGH}`, 'u'), 'entity'],
  [
    /^(?:disse|segundo o Dono,) ".*"; (?:dirigido por (.+)|com (.+) no elenco|do gênero (.+)|[^:]+: (.+))$/u,
    'entity',
  ],
]

/** The Motivo a line reads as, without who: `kind` and `name`. */
const readLine = (text: string): Omit<FilmReason, 'people'> | null => {
  for (const [pattern, kind] of READINGS) {
    const match = pattern.exec(text)
    if (match === null) continue
    const name = match.slice(1).find((group) => group !== undefined)
    return name === undefined ? { kind } : { kind, name }
  }
  return null
}

const sameReason = (
  a: Omit<FilmReason, 'people'>,
  b: Omit<FilmReason, 'people'>,
) => a.kind === b.kind && a.name === b.name

/** The film's Motivo from each Presente's Evidence (by slug, in the
 * Presentes' order, the strongest first), or null when no line for the
 * film reads as one. */
export const filmReason = (
  evidence: Readonly<Record<string, ReadonlyArray<Line>>>,
): FilmReason | null => {
  const read = Object.entries(evidence).flatMap(([person, lines]) =>
    lines.flatMap((line) => {
      if (line.kind === 'guess' || line.contribution <= 0) return []
      const reason = readLine(line.text)
      return reason === null
        ? []
        : [{ person, reason, contribution: line.contribution }]
    }),
  )
  let strongest: (typeof read)[number] | undefined
  for (const candidate of read)
    if (
      strongest === undefined ||
      candidate.contribution > strongest.contribution
    )
      strongest = candidate
  if (strongest === undefined) return null
  const { reason } = strongest
  const people = Object.keys(evidence).filter((person) =>
    read.some((r) => r.person === person && sameReason(r.reason, reason)),
  )
  return { ...reason, people }
}
