import type {
  ImportNotice,
  ImportRefusal,
  QueueNotice,
  QueueRefusal,
} from '#/content/import-action'

const count = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`

const facts = (n: number) =>
  n === 0 ? 'nenhum Fato novo' : count(n, 'Fato novo', 'Fatos novos')

const UNAVAILABLE =
  'Os imports ainda não estão prontos neste servidor: falta o banco do filmes.'

export const IMPORTS = {
  back: 'Voltar',
  title: 'Importar',
  lead: 'Traga as Notas e os Já vistos de uma Pessoa do Letterboxd ou do Trakt. Cada import fica guardado no repo de dados e pode sair depois.',
  people: 'Pessoas',
  count: (n: number) =>
    n === 0 ? 'nenhum import' : count(n, 'import', 'imports'),
  queue: 'Fila de resolução',
  queued: (n: number) =>
    n === 0
      ? 'nenhum filme esperando'
      : count(n, 'filme esperando', 'filmes esperando'),
  empty: 'Nenhuma Pessoa no repo de dados ainda.',
  unavailable: UNAVAILABLE,
  gone: 'Essa Pessoa não está mais no repo de dados.',
} as const

const KINDS: Record<string, string> = {
  letterboxd: 'Export do Letterboxd',
  'letterboxd-rss': 'RSS do Letterboxd',
  trakt: 'Export do Trakt',
}

export const PERSON_IMPORTS = {
  back: 'Importar',
  title: (name: string) => `Imports de ${name}`,
  unknown: 'Nenhuma Pessoa com esse nome no repo de dados.',
  unavailable: UNAVAILABLE,
  notices: {
    letterboxd: (n: number) => `Export do Letterboxd importado: ${facts(n)}.`,
    rss: (n: number) => `RSS do Letterboxd importado: ${facts(n)}.`,
    trakt: (n: number, outside = 0) =>
      `Export do Trakt importado: ${facts(n)}.` +
      (outside === 0
        ? ''
        : ` ${count(outside, 'filme ficou', 'filmes ficaram')} de fora: o Catálogo não tem.`),
    repetido: (n: number) =>
      `Esse arquivo já tinha sido importado: ${facts(n)}.`,
    removido: (n: number) =>
      n === 0
        ? 'Import tirado. Nenhum Fato saiu: outro import tinha os mesmos.'
        : `Import tirado: ${count(n, 'Fato saiu', 'Fatos saíram')}.`,
  } satisfies Record<ImportNotice, (n: number, outside?: number) => string>,
  refusals: {
    pedido: 'Faltou um campo, ou um valor não vale. Confira o formulário.',
    arquivo:
      'Esse arquivo não é o export que o formulário pede. Envie o ZIP como veio, sem descompactar.',
    grande:
      'O arquivo passa de 20 MB. Um export do Letterboxd ou do Trakt costuma ter poucos MB: confira se é o certo.',
    consentimento:
      'Sem o sim dela, o filmes não baixa o RSS. Pergunte a ela e marque a caixa.',
    rss: 'O Letterboxd não tem RSS para esse usuário. Confira o nome no endereço do perfil.',
    fonte: 'O Letterboxd não respondeu agora. Tente de novo daqui a pouco.',
    item: 'Esse import já não está no arquivo dela.',
    indisponivel: 'Não deu para importar agora. Tente de novo daqui a pouco.',
  } satisfies Record<ImportRefusal, string>,

  files: {
    title: 'Arquivos importados',
    lead: 'Tirar um import tira os Fatos que só ele trazia.',
    empty: 'Nenhum import ainda.',
    kind: (kind: string) => KINDS[kind] ?? kind,
    on: (date: string) => `em ${date}`,
    remove: 'Tirar',
    removeLabel: (original: string) => `Tirar ${original}`,
    removeWarning:
      'Os Fatos deste arquivo saem do gosto dela. As decisões da fila continuam valendo.',
    removeConfirm: 'Tirar este import',
  },
  letterboxd: {
    title: 'Letterboxd',
    films: (n: number) =>
      n === 0 ? 'Nenhum filme importado.' : count(n, 'filme', 'filmes'),
    resolved: 'Achados no Catálogo',
    discarded: 'Descartados',
    paths: {
      wikidata: 'pelo Wikidata',
      tmdb: 'pelo TMDB',
      manual: 'pelo Dono',
    },
    queued: (n: number) =>
      count(n, 'filme espera', 'filmes esperam') + ' na fila de resolução',
    toQueue: 'Abrir a fila',
  },
  trakt: {
    title: 'Trakt',
    summary: (ratings: number, seen: number) =>
      `${count(ratings, 'Nota', 'Notas')} e ${count(seen, 'Já visto', 'Já vistos')} do Trakt.`,
  },
  upload: {
    title: 'Trazer um export',
    letterboxd: 'Export do Letterboxd',
    letterboxdHow:
      'No Letterboxd: Settings › Data › Export your data. Envie o ZIP que ele baixar.',
    trakt: 'Export do Trakt',
    traktHow:
      'No Trakt: Settings › Data › Export. Envie o ZIP do export, com os arquivos JSON.',
    file: 'Arquivo ZIP',
    submit: 'Importar',
  },
  rss: {
    title: 'RSS do Letterboxd',
    lead: 'Para quem não exporta: o filmes baixa o RSS público do perfil, com as entradas mais recentes do diário, e guarda uma cópia no repo de dados.',
    user: 'Usuário no Letterboxd',
    userHint: 'o nome no endereço do perfil, letterboxd.com/…',
    consent: (name: string) =>
      `${name} concordou que o filmes baixe o RSS público dela e guarde as Notas.`,
    submit: 'Baixar e importar',
  },
} as const

export const QUEUE = {
  back: 'Importar',
  title: 'Fila de resolução',
  lead: 'Filmes dos exports do Letterboxd que o filmes não achou no Catálogo sozinho. A decisão vale para todas as Pessoas que têm o filme.',
  unavailable: UNAVAILABLE,
  empty: 'Nenhum filme esperando. Tudo resolvido.',
  of: 'de',
  candidates: 'O TMDB sugere',
  pick: 'É este',
  pickLabel: (title: string, tmdb: string) => `É este: ${title}, TMDB ${tmdb}`,
  confirm: 'Confirmar',
  film: 'Filme',
  filmHint: 'tt…, link do IMDb ou link de filme do TMDB',
  discard: 'Descartar',
  discardOpen: 'Descartar este filme',
  reason: 'Motivo',
  reasonHint: 'sem motivo, “ignorar”',
  reasons: ['não é filme', 'ignorar'],
  reprocess: 'Perguntar ao TMDB de novo',
  reprocessLead:
    'O TMDB pode achar agora o que não achou no import. O que ele já respondeu vem do cache.',
  item: (name: string, year: number | null) =>
    year === null ? name : `${name} (${year})`,
  notices: {
    confirmado: () =>
      'Filme confirmado: os Fatos dele entraram para quem o tem.',
    descartado: () => 'Filme descartado: saiu da fila.',
    igual: () => 'Já estava decidido assim: nada mudou.',
    reprocessado: (resolved = 0, left = 0) =>
      `TMDB consultado de novo: ${count(resolved, 'filme saiu', 'filmes saíram')} da fila, ${left === 1 ? '1 continua' : `${left} continuam`}.`,
  } satisfies Record<QueueNotice, (resolved?: number, left?: number) => string>,
  refusals: {
    pedido: 'Faltou um campo, ou um valor não vale. Confira o formulário.',
    filme: 'Use um tt…, um link de filme do IMDb ou um link de filme do TMDB.',
    'sem-imdb':
      'O TMDB não tem o ID do IMDb desse filme. Confirme com o tt… ou com o link do IMDb.',
    item: 'Esse filme já saiu da fila: alguém decidiu antes.',
    indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
  } satisfies Record<QueueRefusal, string>,
} as const
