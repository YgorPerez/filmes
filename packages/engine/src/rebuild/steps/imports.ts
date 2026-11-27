// `31_letterboxd`, `32_trakt`, `33_imdb` and `34_simkl`: the Pessoas' stored imports,
// through the same loaders the import commands use.

import { loadImdb } from '../../imports/imdb.ts'
import { loadLetterboxd } from '../../imports/letterboxd.ts'
import { loadSimkl } from '../../imports/simkl.ts'
import { loadTrakt } from '../../imports/trakt.ts'
import type { Step } from './Step.ts'

export const letterboxd: Step = {
  name: '31_letterboxd',
  load: (db) => loadLetterboxd(db),
}

export const trakt: Step = { name: '32_trakt', load: loadTrakt }

export const imdb: Step = { name: '33_imdb', load: loadImdb }

export const simkl: Step = { name: '34_simkl', load: loadSimkl }
