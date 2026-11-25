// The signals, in Python's module order (`sinais/*.py` sorted by name):
// that order is the order of each film's Evidence and of the sums over it
// (R8), so a new signal goes in its Python name's place.

import { mood } from './mood.ts'
import { content } from './content.ts'
import { group } from './group.ts'
import { imdbRating } from './imdb-rating.ts'
import { neighbors } from './neighbors.ts'
import { seen } from './seen.ts'
import type { Signal } from './Signal.ts'
import { stated } from './stated.ts'

export const SIGNALS: ReadonlyArray<Signal> = [
  mood,
  content,
  stated,
  group,
  seen,
  imdbRating,
  neighbors,
]
