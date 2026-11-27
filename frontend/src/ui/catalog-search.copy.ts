import type { Link } from '@filmes/engine'
import type { SearchRefusal } from '#/platform/catalog-search'

const films = (n: number) => (n === 1 ? '1 filme' : `${n} filmes`)

export const CATALOG_SEARCH = {
  title: 'Buscar no Catálogo',
  leadFilms: 'Ache um filme pelo título, sem ligar para acento.',
  leadAll:
    'Ache um filme, diretor ou ator para usar num Veto ou Declarado. Usar põe o ID nos campos de alvo.',
  label: 'Título ou nome',
  hint: '“Título (ano)” filtra pelo ano',
  submit: 'Buscar',
  searching: 'Buscando…',
  remove: (title: string) => `Tirar ${title}`,
  results: (query: string) => `Resultado para “${query}”`,
  none: 'Nada no Catálogo com esse nome. Tente o título original, ou o ano: Matrix (1999).',
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
    cinematography: 'fotografia',
    producer: 'produção',
  } satisfies Record<Link, string>,
  films,
  votes: (n: number) => `${n.toLocaleString('pt-BR')} votos`,
  refusals: {
    curta: 'Escreva pelo menos 2 letras ou números para buscar.',
    // The server's refusal, which it logs, and the browser's failure to
    // reach it, which nothing logs and a retry may fix.
    indisponivel:
      'A busca não funcionou. Confira a conexão; se ela estiver boa, o site está com um problema, e ele ficou registrado no log do servidor.',
  } satisfies Record<SearchRefusal, string>,
}
