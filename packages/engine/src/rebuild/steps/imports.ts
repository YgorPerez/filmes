// `31_letterboxd`, `32_trakt` and `33_imdb`: the Pessoas' stored imports,
// through the same loaders the import commands use.

import { loadImdb } from '../../imports/imdb.ts'
import { loadLetterboxd } from '../../imports/letterboxd.ts'
import { loadTrakt } from '../../imports/trakt.ts'
import type { Step } from './Step.ts'

export const letterboxd: Step = {
  name: '31_letterboxd',
  load: (db) => loadLetterboxd(db),
}

export const trakt: Step = { name: '32_trakt', load: loadTrakt }

export const imdb: Step = { name: '33_imdb', load: loadImdb }
