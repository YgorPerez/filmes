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

const KINDS: Record<string, string> = {
  letterboxd: 'Arquivo do Letterboxd',
  'letterboxd-rss': 'RSS do Letterboxd',
  trakt: 'Arquivo do Trakt',
}

export const PERSON_IMPORTS = {
  /** Back to her page: Meu gosto, or her name. */
  back: (name: string, own: boolean) => (own ? 'Meu gosto' : name),
  title: (name: string, own: boolean) =>
    own ? 'Importar Notas' : `Importar as Notas de ${name}`,
  unknown: 'Nenhuma Pessoa com esse nome no repo de dados.',
  unavailable: UNAVAILABLE,
  notices: {
    letterboxd: (n: number) => `Arquivo do Letterboxd importado: ${facts(n)}.`,
    rss: (n: number) => `RSS do Letterboxd importado: ${facts(n)}.`,
    trakt: (n: number, outside = 0) =>
      `Arquivo do Trakt importado: ${facts(n)}.` +
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
      'Não deu para ler esse arquivo. Envie o ZIP como o Letterboxd ou o Trakt te deu, sem descompactar.',
    origem: 'Esse ZIP não parece ser do Letterboxd nem do Trakt.',
    grande:
      'O arquivo passa de 20 MB. O ZIP do Letterboxd ou do Trakt costuma ter poucos MB: confira se é o certo.',
    consentimento:
      'Sem o sim da Pessoa, o filmes não lê o diário do Letterboxd. Pergunte e marque a caixa.',
    rss: 'O Letterboxd não achou esse perfil. Confira o nome no endereço do perfil.',
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
    removeBusy: 'Tirando…',
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
    title: 'O arquivo do Letterboxd ou do Trakt',
    file: 'Arquivo que o Letterboxd ou o Trakt te deu (ZIP)',
    /** How to download the ZIP, one line per service: the service's name
     * links to its data settings. */
    how: [
      {
        service: 'Letterboxd',
        href: 'https://letterboxd.com/settings/data/',
        steps: 'Settings › Data › Export your data.',
      },
      {
        service: 'Trakt',
        href: 'https://trakt.tv/settings/data',
        steps: 'Settings › Data › Export.',
      },
    ],
    submit: 'Importar',
    /** Importar while its post runs. */
    busy: 'Importando…',
  },
  rss: {
    title: 'Ou só o recente, pelo perfil',
    lead: 'Sem o ZIP, o filmes lê as entradas mais recentes do diário público no Letterboxd. Para o histórico inteiro, use o arquivo acima.',
    user: 'Perfil no Letterboxd',
    userHint: 'o nome, @nome ou o endereço do perfil',
    consent: (name: string) =>
      `${name} concordou que o filmes leia o diário público do Letterboxd e guarde as Notas`,
    submit: 'Importar do perfil',
    busy: 'Lendo o perfil…',
  },
} as const

export const QUEUE = {
  back: 'Voltar',
  title: 'Fila de resolução',
  lead: 'Filmes dos arquivos do Letterboxd que o filmes não achou no Catálogo sozinho. A decisão vale para todas as Pessoas que têm o filme.',
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
  /** A button while its post runs. */
  busy: {
    confirm: 'Confirmando…',
    discard: 'Descartando…',
    reprocess: 'Perguntando ao TMDB…',
  },
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
