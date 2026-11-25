// `31_letterboxd` and `32_trakt`: the Pessoas' stored imports, through the
// same loaders the import commands use.

import { loadLetterboxd } from '../../imports/letterboxd.ts'
import { loadTrakt } from '../../imports/trakt.ts'
import type { Step } from './Step.ts'

export const letterboxd: Step = {
  name: '31_letterboxd',
  load: (db) => loadLetterboxd(db),
}

export const trakt: Step = { name: '32_trakt', load: loadTrakt }
