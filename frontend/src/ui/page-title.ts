import { weekdayDate } from './dates'

// The `<title>` of each page (#268): what the page is, then "filmes", so
// tabs and the history tell the pages apart. One table by route id, read by
// the root's `head` from the deepest match (`titleOf`), so no route names
// its own and a new page adds a line here. Code, not a component.

type Match = {
  routeId: string
  status: string
  loaderData?: unknown
  _notFound?: boolean
}

/** A field of the loader's data, when it is there. */
const read = (data: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>(
    (value, key) =>
      typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)[key]
        : undefined,
    data,
  )

const text = (value: unknown) => (typeof value === 'string' ? value : null)

const NOT_FOUND = 'Página não encontrada'

const TITLES: Record<string, string | ((data: unknown) => string | null)> = {
  '/_owner/': 'Início',
  '/entrar': 'Entrar',
  '/_owner/sessoes/': 'Sessões',
  '/_owner/sessoes/nova': 'Nova Sessão',
  '/_owner/sessoes/$sessao/': (data) => {
    const date = text(read(data, 'session', 'date'))
    return date && `Sessão de ${weekdayDate(date)}`
  },
  '/_owner/sessoes/$sessao/contar': 'Contar como foi',
  '/_owner/pessoas/': 'Pessoas',
  '/_owner/pessoas/$pessoa/': (data) => text(read(data, 'page', 'name')),
  '/_owner/pessoas/$pessoa/importar': (data) => {
    const name = text(read(data, 'name'))
    return name && `Importar para ${name}`
  },
  '/_owner/meu-gosto/': 'Meu gosto',
  '/_owner/meu-gosto/notas': 'Dar notas',
  '/_owner/meu-gosto/importar': 'Importar',
  '/_owner/meu-gosto/fila': 'Fila de resolução',
  '/_owner/operacoes': 'Operações',
  // The link's pages: the names until a Presente is chosen (#275).
  '/participar': (data) => text(read(data, 'title')),
  '/participar/votar': 'Votar',
  '/participar/perguntas/': 'Perguntas de gosto',
}

/** "Sessões · filmes"; "filmes" with no name. */
export const pageTitle = (name?: string | null) =>
  name ? `${name} · filmes` : 'filmes'

/** The title of the page the router matched: "Página não encontrada" when
 * an address leads nowhere, else the deepest route's, else "filmes". */
export function titleOf(matches: readonly Match[]): string {
  if (matches.some((m) => m.status === 'notFound' || m._notFound === true))
    return pageTitle(NOT_FOUND)
  for (const match of [...matches].reverse()) {
    const title = TITLES[match.routeId]
    if (title !== undefined)
      return pageTitle(
        typeof title === 'string' ? title : title(match.loaderData),
      )
  }
  return pageTitle(null)
}
