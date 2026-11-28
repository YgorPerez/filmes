// The Clima [mood] bonus: a film line for each Clima asked for that the film
// backs (`recomendacao/sinais/clima.py`). Each Clima of the vocabulary has
// MovieLens tags and genres; a Candidate gets, per Clima, the strongest
// Evidence among them (`tags.ts`). A Clima of popularity has neither: its
// line comes from the film's IMDb votes (`popularity.ts`, #387). The
// Evidence has no Pessoa: it adds to the Regra's score, never to anyone's
// utility. The weight is `[mood]`, and `[popularity]` for the votes.

import { Effect } from 'effect'
import type { Mood } from '../moods.ts'
import { popularityLines } from './popularity.ts'
import type { Round, Signal } from './Signal.ts'
import { strongest } from './tags.ts'

/** The Clima's lines, before a redo's refill: by the votes for a Clima of
 * popularity, by its tags and genres for the others. */
const linesOf = (round: Round, m: Mood) => {
  const { popularity } = m
  return popularity === null
    ? strongest(
        round,
        `Clima ${m.name}`,
        m.tags,
        m.genres,
        round.weights.mood.weight,
      )
    : Effect.sync(() => popularityLines(round, m.name, popularity))
}

export const mood: Signal = {
  module: 'clima',
  forFilm: (round) => {
    const refill = round.refillMoods
    const requested = new Set(round.moods.map((m) => m.name))
    const moods = [
      ...round.moods,
      ...(refill?.moods.filter((m) => !requested.has(m.name)) ?? []),
    ]
    return Effect.map(
      Effect.forEach(moods, (m) =>
        Effect.map(linesOf(round, m), (lines) => {
          if (!refill?.moods.some((extra) => extra.name === m.name))
            return lines
          const repeated = requested.has(m.name)
          return lines.flatMap((line) => {
            if (refill.kept(line.filmId)) return repeated ? [line] : []
            return [repeated ? { ...line, base: 2 * line.base } : line]
          })
        }),
      ),
      (lines) => lines.flat(),
    )
  },
}
