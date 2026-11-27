import type { CreditSource } from '@filmes/engine'

export const CREDITS_PAGE = {
  brand: 'filmes',
  home: 'filmes, início',
  title: 'Créditos',
  lead: 'Os filmes, as capas e as notas vêm destas fontes. O aviso que cada uma pede fica aqui, e não nos cards.',
  sources: 'Fontes',
} as const

/** What filmes takes from each source of the engine's `CREDITS`. */
export const CREDIT_USES: Readonly<Record<CreditSource, string>> = {
  IMDb: 'Os filmes, o elenco, a nota e os votos, e as notas que cada Pessoa importa.',
  TMDB: 'As capas, os títulos em português e as sinopses.',
  Wikidata:
    'Quem fez cada filme, séries, prêmios, datas de estreia, subgêneros e classificação etária.',
  MovieLens: 'As notas de quem deu 4 ou mais a um filme e a outro.',
  'Tag Genome': 'As tags dos filmes, que movem o Clima e o Parecido.',
  OMDb: 'A classificação etária, quando falta no Wikidata, e a nota da crítica dos primeiros filmes.',
  'Rotten Tomatoes': 'O Tomatometer, pelo OMDb, na linha do filme.',
  Metacritic: 'O Metascore, pelo OMDb, na linha do filme.',
  'Does the Dog Die': 'Os avisos de conteúdo ("um cachorro morre").',
  Trakt:
    'O histórico, as notas e a lista para ver que cada Pessoa importa. Para quem conecta a conta, o filmes também grava lá o que ela viu e a nota que deu.',
  Letterboxd:
    'O histórico, as notas e a lista para ver do export que cada Pessoa baixa.',
  Simkl:
    'O histórico, as notas e a lista para ver do backup que cada Pessoa baixa.',
  'TV Time':
    'Os filmes vistos, as notas e a lista para ver do export que cada Pessoa baixa.',
  YouTube: 'Os trailers, pelo link do card.',
}
