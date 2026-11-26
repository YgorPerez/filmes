import type { Link } from '@filmes/engine'
import type { SearchRefusal } from '#/platform/catalog-search'

const films = (n: number) => (n === 1 ? '1 filme' : `${n} filmes`)

export const CATALOG_SEARCH = {
  title: 'Buscar no Catálogo',
  leadFilms:
    'Ache o ID de um filme pelo título, sem ligar para acento. A busca recarrega a página: busque antes de preencher o resto.',
  leadAll:
    'Ache o ID de um filme (tt…), de um diretor, ator, gênero ou série (Q…) pelo nome, sem ligar para acento. Copie o ID para o campo de alvo.',
  label: 'Título ou nome',
  hint: '“Título (ano)” filtra pelo ano',
  submit: 'Buscar',
  searching: 'Buscando…',
  remove: (title: string) => `Tirar ${title}`,
  results: (query: string) => `Resultado para “${query}”`,
  none: 'Nada no Catálogo com esse nome. Tente o título original.',
  pick: 'Usar',
  pickLabel: (title: string) => `Usar ${title}`,
  groups: {
    films: 'Filmes',
    people: 'Diretores, roteiristas e atores',
    genres: 'Gêneros',
    series: 'Séries',
  },
  links: {
    director: 'direção',
    writer: 'roteiro',
    cast: 'elenco',
    series: 'série',
    genre: 'gênero',
  } satisfies Record<Link, string>,
  films,
  votes: (n: number) => `${n.toLocaleString('pt-BR')} votos`,
  refusals: {
    curta: 'Escreva pelo menos 2 letras ou números para buscar.',
    indisponivel:
      'A busca não está pronta neste servidor: falta o banco do filmes.',
  } satisfies Record<SearchRefusal, string>,
}
