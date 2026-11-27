import { weekdayDate } from './dates'

// The `<title>` of each page (#268): what the page is, then "filmes", so
// tabs and the history tell the pages apart. A route's `head` takes
// `titled(...)`; the root's is "filmes" alone. Code, not a component.

export const PAGE_TITLES = {
  home: 'Início',
  signIn: 'Entrar',
  sessions: 'Sessões',
  newSession: 'Nova Sessão',
  session: (date: string) => `Sessão de ${weekdayDate(date)}`,
  feedback: 'Contar como foi',
  people: 'Pessoas',
  myTaste: 'Meu gosto',
  rate: 'Dar notas',
  queue: 'Fila de resolução',
  operations: 'Operações',
  notFound: 'Página não encontrada',
  participate: 'Filmes da Sessão',
  vote: 'Votar',
  questions: 'Perguntas de gosto',
} as const

/** "Sessões · filmes"; "filmes" with no name. */
export const pageTitle = (name?: string | null) =>
  name ? `${name} · filmes` : 'filmes'

/** A route's `head` for `name`. */
export const titled = (name?: string | null) => ({
  meta: [{ title: pageTitle(name) }],
})
