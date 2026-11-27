// The attributions the sources used by a recommendation require
// (`recomendacao/atribuicoes.py`). Not "créditos", so as not to mix it up
// with the cast credits.
//
// The IMDb is always there: every Candidate comes from its datasets. The
// others come in when some Evidence returned has a source with their name
// ("Trakt da Ana"); TMDB also when some film comes with a poster or a
// Portuguese title.
//
// `CREDITS` is the app's credits page (#292): every source the engine
// reads, with these texts word for word and what the other licenses ask
// (OMDb's CC BY-NC 4.0, MovieLens' "may not state or imply any
// endorsement"), and nothing on the cards. A new source adds its line
// there.

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

/** A source on the credits page: its name, where it lives, what filmes
 * takes from it, and the notice its terms ask for, or `null` when they ask
 * for none. */
export interface Credit {
  readonly source: string
  readonly url: string
  readonly use: string
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
    use: 'Os filmes, o elenco, a nota e os votos, e as notas que cada Pessoa importa.',
    notice: textOf('IMDb'),
  },
  {
    source: TMDB_ATTRIBUTION.source,
    url: 'https://www.themoviedb.org',
    use: 'As capas, os títulos em português e as sinopses.',
    notice: TMDB_ATTRIBUTION.text,
  },
  {
    source: 'Wikidata',
    url: 'https://www.wikidata.org',
    use: 'Quem fez cada filme, séries, prêmios, datas de estreia, subgêneros e classificação etária.',
    notice: 'Dados do Wikidata, em domínio público (CC0).',
  },
  {
    source: 'MovieLens',
    url: 'https://grouplens.org/datasets/movielens/',
    use: 'As notas de quem deu 4 ou mais a um filme e a outro.',
    notice:
      'MovieLens ml-32m, do GroupLens Research, da Universidade de Minnesota ' +
      '(F. Maxwell Harper e Joseph A. Konstan, 2015, https://doi.org/10.1145/2827872). ' +
      'O GroupLens não endossa o filmes.',
  },
  {
    source: 'Tag Genome',
    url: 'https://grouplens.org/datasets/movielens/tag-genome-2021/',
    use: 'As tags dos filmes, que movem o Clima e o Parecido.',
    notice: textOf('Tag Genome'),
  },
  {
    source: 'OMDb',
    url: 'https://www.omdbapi.com',
    use: 'A classificação etária, quando falta no Wikidata, e a nota da crítica dos primeiros filmes.',
    notice:
      'Dados do OMDb (https://www.omdbapi.com), sob licença CC BY-NC 4.0 ' +
      '(https://creativecommons.org/licenses/by-nc/4.0/)',
  },
  {
    source: 'Rotten Tomatoes',
    url: 'https://www.rottentomatoes.com',
    use: 'O Tomatometer, pelo OMDb, na linha do filme.',
    notice:
      'Rotten Tomatoes® e Tomatometer® são marcas da Fandango; o filmes não é endossado por ela.',
  },
  {
    source: 'Metacritic',
    url: 'https://www.metacritic.com',
    use: 'O Metascore, pelo OMDb, na linha do filme.',
    notice:
      'Metacritic e Metascore são marcas da Fandom; o filmes não é endossado por ela.',
  },
  {
    source: DDD_NAME,
    url: 'https://www.doesthedogdie.com',
    use: 'Os avisos de conteúdo ("um cachorro morre").',
    notice: DDD_ATTRIBUTION,
  },
  {
    source: TRAKT_ATTRIBUTION.source,
    url: 'https://trakt.tv',
    use: 'O histórico, as notas e a lista para ver que cada Pessoa importa.',
    notice: TRAKT_ATTRIBUTION.text,
  },
  {
    source: 'Letterboxd',
    url: 'https://letterboxd.com',
    use: 'O histórico, as notas e a lista para ver do export que cada Pessoa baixa.',
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
