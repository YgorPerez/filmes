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
  forFilm: (round) =>
    Effect.map(
      Effect.forEach(round.moods, (m) =>
        strongest(
          round,
          `Clima ${m.name}`,
          m.tags,
          m.genres,
          round.weights.mood.weight,
        ),
      ),
      (lines) => lines.flat(),
    ),
}
