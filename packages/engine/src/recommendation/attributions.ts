// The attributions the sources used by a recommendation require
// (`recomendacao/atribuicoes.py`). Not "créditos", so as not to mix it up
// with the cast credits.
//
// The IMDb is always there: every Candidate comes from its datasets. The
// others come in when some Evidence returned has a source with their name
// ("Trakt da Ana"); TMDB also when some film comes with a poster or a
// Portuguese title.
//
// `CREDITS` feeds the app's credits page (#292): every source the engine
// reads, with these texts word for word and what the other licenses ask
// (OMDb's CC BY-NC 4.0, MovieLens' "may not state or imply any
// endorsement"), and nothing on the cards. Only the source, its site and
// its notice live here; what filmes takes from each is the page's copy
// (`frontend/src/ui/credits.copy.ts`). A new source adds its line here and
// its use there.

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

/** The sources on the credits page, in the order it shows them. */
export type CreditSource =
  | 'IMDb'
  | 'TMDB'
  | 'Wikidata'
  | 'MovieLens'
  | 'Tag Genome'
  | 'OMDb'
  | 'Rotten Tomatoes'
  | 'Metacritic'
  | 'Does the Dog Die'
  | 'Trakt'
  | 'Letterboxd'
  | 'Simkl'
  | 'TV Time'
  | 'YouTube'

/** A source on the credits page: its name, where it lives, and the notice
 * its terms ask for, or `null` when they ask for none. */
export interface Credit {
  readonly source: CreditSource
  readonly url: string
  readonly notice: string | null
}

const textOf = (source: string) => {
  const found = TEXTS.find((t) => t.source === source)
  if (!found) throw new Error(`no attribution for ${source}`)
  return found.text
}

/** Every source the engine reads, in the order the credits page shows. */
export const CREDITS: ReadonlyArray<Credit> = [
  {
    source: 'IMDb',
    url: 'https://www.imdb.com',
    notice: textOf('IMDb'),
  },
  {
    source: 'TMDB',
    url: 'https://www.themoviedb.org',
    notice: TMDB_ATTRIBUTION.text,
  },
  {
    source: 'Wikidata',
    url: 'https://www.wikidata.org',
    notice: 'Dados do Wikidata, em domínio público (CC0).',
  },
  {
    source: 'MovieLens',
    url: 'https://grouplens.org/datasets/movielens/',
    notice:
      'MovieLens ml-32m, do GroupLens Research, da Universidade de Minnesota ' +
      '(F. Maxwell Harper e Joseph A. Konstan, 2015, https://doi.org/10.1145/2827872). ' +
      'O GroupLens não endossa o filmes.',
  },
  {
    source: 'Tag Genome',
    url: 'https://grouplens.org/datasets/movielens/tag-genome-2021/',
    notice: textOf('Tag Genome'),
  },
  {
    source: 'OMDb',
    url: 'https://www.omdbapi.com',
    notice:
      'Dados do OMDb (https://www.omdbapi.com), sob licença CC BY-NC 4.0 ' +
      '(https://creativecommons.org/licenses/by-nc/4.0/)',
  },
  {
    source: 'Rotten Tomatoes',
    url: 'https://www.rottentomatoes.com',
    notice:
      'Rotten Tomatoes® e Tomatometer® são marcas da Fandango; o filmes não é endossado por ela.',
  },
  {
    source: 'Metacritic',
    url: 'https://www.metacritic.com',
    notice:
      'Metacritic e Metascore são marcas da Fandom; o filmes não é endossado por ela.',
  },
  {
    source: 'Does the Dog Die',
    url: 'https://www.doesthedogdie.com',
    notice: DDD_ATTRIBUTION,
  },
  {
    source: 'Trakt',
    url: 'https://trakt.tv',
    notice: TRAKT_ATTRIBUTION.text,
  },
  {
    source: 'Letterboxd',
    url: 'https://letterboxd.com',
    notice: null,
  },
  {
    source: 'Simkl',
    url: 'https://simkl.com',
    notice: null,
  },
  {
    source: 'TV Time',
    url: 'https://www.tvtime.com',
    notice: null,
  },
  {
    source: 'YouTube',
    url: 'https://www.youtube.com',
    notice: null,
  },
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
