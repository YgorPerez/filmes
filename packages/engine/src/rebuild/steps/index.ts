// The loading steps, in Python's module order (`banco/etapas/*.py` sorted by
// name): later steps read what earlier ones loaded (the age ratings read the
// catalog's, the similarity reads the tags). A new step goes in its name's
// place.

import { ageRatings } from './age-ratings.ts'
import { csvTables } from './csv-tables.ts'
import { filmSeries } from './film-series.ts'
import { imdb, letterboxd, simkl, trakt } from './imports.ts'
import { people } from './people.ts'
import { realCatalog } from './real-catalog.ts'
import { sessions } from './sessions.ts'
import { similarity } from './similarity.ts'
import { subgenres } from './subgenres.ts'
import { tasteScales } from './taste-scales.ts'
import type { Step } from './Step.ts'

export const STEPS: ReadonlyArray<Step> = [
  people,
  realCatalog,
  subgenres,
  csvTables,
  filmSeries,
  letterboxd,
  trakt,
  imdb,
  simkl,
  sessions,
  ageRatings,
  similarity,
  tasteScales,
]
