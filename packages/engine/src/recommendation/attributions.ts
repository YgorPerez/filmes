// The attributions the sources used by a recommendation require
// (`recomendacao/atribuicoes.py`). Not "créditos", so as not to mix it up
// with the Sessions' Crédito.
//
// The IMDb is always there: every Candidate comes from its datasets. The
// others come in when some Evidence returned has a source with their name
// ("Trakt da Ana"); TMDB also when some film comes with a poster or a
// Portuguese title. Wikidata (CC0), Letterboxd, MovieLens ml-32m and OMDb
// ask for no attribution on screen.

import { casefold } from '../compat/text.ts'
import { DDD_ATTRIBUTION, DDD_NAME } from '../sources/DoesTheDogDie.ts'
import { TMDB_ATTRIBUTION } from '../sources/Tmdb.ts'

export interface Attribution {
  readonly source: string
  readonly text: string
}

const ALWAYS = 'IMDb'

/** What Trakt asks to be shown wherever its data is (the import too). */
export const TRAKT_ATTRIBUTION: Attribution = {
  source: 'Trakt',
  text: 'filmes uses Trakt but is not endorsed or certified by Trakt',
}

/** Source → the text it requires, in the order they come out. */
const TEXTS: ReadonlyArray<Attribution> = [
  {
    source: 'IMDb',
    text: 'Information courtesy of IMDb (https://www.imdb.com). Used with permission.',
  },
  { source: DDD_NAME, text: DDD_ATTRIBUTION },
  {
    source: 'Tag Genome',
    text:
      'Tag Genome 2021, de Kotkov, Maslov e Neovius ' +
      '(https://grouplens.org/datasets/movielens/tag-genome-2021/), sob licença CC BY-NC 3.0 ' +
      '(https://creativecommons.org/licenses/by-nc/3.0/)',
  },
  TRAKT_ATTRIBUTION,
  TMDB_ATTRIBUTION,
]

/** The attributions of the sources named, each once, in the fixed order. */
export const attributionsOf = (
  sources: Iterable<string | null>,
): ReadonlyArray<Attribution> => {
  const used = [...sources].filter((s): s is string => !!s).map(casefold)
  return TEXTS.filter(
    ({ source }) =>
      source === ALWAYS || used.some((name) => name.includes(casefold(source))),
  ).map(({ source, text }) => ({ source, text }))
}
