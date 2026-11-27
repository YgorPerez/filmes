// The Clima [mood] bonus: a film line for each Clima asked for that the film
// backs (`recomendacao/sinais/clima.py`). Each Clima of the vocabulary has
// MovieLens tags and genres; a Candidate gets, per Clima, the strongest
// Evidence among them (`tags.ts`). The Evidence has no Pessoa: it adds to
// the Regra's score, never to anyone's utility. The weight is `[mood]`.

import { Effect } from 'effect'
import type { Signal } from './Signal.ts'
import { strongest } from './tags.ts'

export const mood: Signal = {
  module: 'clima',
  forFilm: (round) => {
    const requested = new Set(round.moods.map((m) => m.name))
    const refill = new Map(round.refillMoods?.moods.map((m) => [m.name, m]))
    const moods = [
      ...round.moods,
      ...[...refill.values()].filter((m) => !requested.has(m.name)),
    ]
    return Effect.map(
      Effect.forEach(moods, (m) =>
        Effect.map(
          strongest(
            round,
            `Clima ${m.name}`,
            m.tags,
            m.genres,
            round.weights.mood.weight,
          ),
          (lines) => {
            if (!refill.has(m.name)) return lines
            const repeated = requested.has(m.name)
            return lines.flatMap((line) => {
              if (round.refillMoods?.kept(line.filmId))
                return repeated ? [line] : []
              return [repeated ? { ...line, base: 2 * line.base } : line]
            })
          },
        ),
      ),
      (lines) => lines.flat(),
    )
  },
}
