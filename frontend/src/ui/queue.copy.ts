import type { QueueNotice, QueueRefusal } from '#/content/import-action'

const count = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`

const minutes = (n: number) =>
  n < 60
    ? `${n} min`
    : `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, '0')}`

/** A country or a language by its code, in Portuguese ("Alemanha",
 * "alemão"); the code itself where the runtime has no name for it. */
const displayName = (type: 'region' | 'language', code: string) => {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type }).of(code) ?? code
  } catch {
    return code
  }
}

const names = (people: readonly string[]) =>
  people.length === 1
    ? people[0]
    : `${people.slice(0, -1).join(', ')} e ${people.at(-1)}`

export const QUEUE = {
  back: 'Importar',
  /** Back to the import of the Pessoa that sent her here (#274). */
  backFrom: (name: string) => `Importar · ${name}`,
  title: 'Fila de resolução',
  lead: 'Filmes dos arquivos importados que o filmes não achou sozinho no Catálogo. As Notas deles só contam no gosto depois que você disser qual filme é. A decisão vale para todas as Pessoas que têm o filme.',
  unavailable:
    'Não deu para abrir a fila: o site está com um problema, e ele ficou registrado no log do servidor.',
  empty: 'Nenhum filme esperando. Tudo resolvido.',
  /** What waits on the film: whose taste it goes to. */
  stake: (people: readonly string[]) =>
    `Conta no gosto de ${names(people)} quando você resolver.`,
  candidates: 'Pode ser um destes',
  pick: 'É este',
  pickLabel: (title: string, detail: string | null) =>
    detail ? `É este: ${title}, ${detail}` : `É este: ${title}`,
  poster: (title: string) => `Cartaz de ${title}`,
  /** What tells twins apart (#274): "Helena Prado · 1 h 44 · Brasil",
   * and the original language when it is not Portuguese. Null when TMDB
   * gave none of it. */
  details: ({
    directors,
    runtime,
    countries,
    language,
  }: {
    directors: readonly string[]
    runtime: number | null
    countries: readonly string[]
    language: string | null
  }) => {
    const parts = [
      directors.length > 0 ? `Direção: ${names(directors)}` : null,
      runtime === null ? null : minutes(runtime),
      countries.length > 0
        ? countries.map((code) => displayName('region', code)).join(', ')
        : null,
      language === null ? null : `em ${displayName('language', language)}`,
    ].filter((part) => part !== null)
    return parts.length === 0 ? null : parts.join(' · ')
  },
  /** A synopsis only in a language other than Portuguese or English. */
  noOverview: 'Sem sinopse em português.',
  original: (title: string) => `Título original: ${title}`,
  /** The in-app search, in place of an id from another site. */
  search: 'Procurar outro título',
  searchLabel: (title: string) => `Procurar outro título para ${title}`,
  searchField: 'Título no Catálogo',
  searchHint: '“Título (ano)” filtra pelo ano',
  searchSubmit: 'Procurar',
  found: (query: string) => `No Catálogo, para “${query}”`,
  none: 'Nada no Catálogo com esse nome. Tente o título original, ou o ano: Matrix (1999).',
  /** The id paste, inside the search's fold. */
  link: 'Ou cole o link',
  confirm: 'Confirmar',
  film: 'Link ou ID do filme',
  filmHint: 'do IMDb (tt…) ou do TMDB',
  discard: 'Tirar da fila',
  /** The reasons, one button each: what the engine records. */
  reasons: [
    { value: 'não é filme', label: 'Não é filme' },
    { value: 'ignorar', label: 'Não quero contar' },
  ],
  reasonLabel: (reason: string, title: string) => `${reason}: ${title}`,
  reprocess: 'Procurar de novo',
  reprocessLead:
    'O TMDB pode achar agora o que não achou no import. Procurar de novo pergunta a ele os filmes que ainda esperam.',
  /** A button while its post runs. */
  busy: {
    confirm: 'Confirmando…',
    discard: 'Tirando…',
    reprocess: 'Procurando…',
    reopen: 'Desfazendo…',
  },
  item: (name: string, year: number | null) =>
    year === null ? name : `${name} (${year})`,
  /** What the last decision did, naming the film when the route says it. */
  notices: {
    confirmado: (title?: string) =>
      title
        ? `${title} confirmado: as Notas dele entraram no gosto de quem o tem.`
        : 'Filme confirmado: as Notas dele entraram no gosto de quem o tem.',
    descartado: (title?: string) =>
      title ? `${title} saiu da fila.` : 'Filme descartado: saiu da fila.',
    reaberto: (title?: string) =>
      title ? `${title} voltou para a fila.` : 'O filme voltou para a fila.',
    igual: () => 'Já estava decidido assim: nada mudou.',
    reprocessado: (_title?: string, resolved = 0, left = 0) =>
      `Procurei de novo: ${count(resolved, 'filme saiu', 'filmes saíram')} da fila, ${left === 1 ? '1 continua' : `${left} continuam`}.`,
  } satisfies Record<
    QueueNotice,
    (title?: string, resolved?: number, left?: number) => string
  >,
  undo: 'Desfazer',
  undoLabel: (title: string) => `Desfazer a decisão sobre ${title}`,
  /** TMDB's notice, in Portuguese. */
  attribution: 'Usa a API do TMDB, sem aval do TMDB.',
  refusals: {
    pedido: 'Faltou um campo, ou um valor não vale. Confira o formulário.',
    filme: 'Cole um link de filme do IMDb ou do TMDB, ou o tt… dele.',
    'sem-imdb':
      'O TMDB não tem o ID do IMDb desse filme. Procure o título no Catálogo, ou cole o link do IMDb.',
    item: 'Esse filme já não está na fila: alguém decidiu antes, ou a decisão já foi desfeita.',
    indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  } satisfies Record<QueueRefusal, string>,
} as const
