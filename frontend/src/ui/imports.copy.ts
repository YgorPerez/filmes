import type { SourceFilms } from '@filmes/engine'
import type {
  ChangedRating,
  ImportNotice,
  ImportRefusal,
} from '#/content/import-action'
import { shortDate } from './dates'

const count = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`

/** "a, b e c". */
const andList = (parts: readonly string[]) =>
  parts.length < 2
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')} e ${parts.at(-1)}`

/** A site's films in the words of its notice: "2 Notas, 1 Já visto e 1
 * filme na watchlist"; null with none. A rated film is no Já visto of its
 * own. */
const filmsText = ({ rated, seen, watchlist }: SourceFilms) =>
  rated + seen + watchlist === 0
    ? null
    : andList(
        [
          rated > 0 && count(rated, 'Nota', 'Notas'),
          seen > 0 && count(seen, 'Já visto', 'Já vistos'),
          watchlist > 0 &&
            count(watchlist, 'filme na watchlist', 'filmes na watchlist'),
        ].filter((part) => part !== false),
      )

/** What an import did to her Notas list (#274): the films with a first
 * Nota, the ones seen for the first time, the Notas it replaced (the
 * first few by name) and the films that kept theirs. */
type Gave = {
  facts: number
  ratings: number
  seen: number
  changed?: number
  changes?: readonly ChangedRating[]
  repeated?: number
  watchlist?: number
  outside?: number
}

/** "Maré Baixa (2015), de 9 para 1". */
const changeText = ({ title, from, to }: ChangedRating) =>
  `${title}, de ${from} para ${to}`

const changedText = (n: number, named: readonly ChangedRating[]) => {
  const rest = n - named.length
  const names = named.map(changeText).join('; ')
  const more = rest > 0 ? ` e mais ${count(rest, 'outra', 'outras')}` : ''
  return n === 1
    ? `1 Nota mudou: ${names}`
    : `${n} Notas mudaram: ${names}${more}`
}

const gave = ({
  facts,
  ratings,
  seen,
  changed = 0,
  changes = [],
  repeated = 0,
  watchlist = 0,
}: Gave) => {
  const fresh = [
    ratings > 0 && count(ratings, 'Nota nova', 'Notas novas'),
    seen > 0 && count(seen, 'Já visto novo', 'Já vistos novos'),
    watchlist > 0 &&
      count(watchlist, 'filme na watchlist', 'filmes na watchlist'),
  ].filter((part) => part !== false)
  const sentences = [
    fresh.length > 0 && `entraram ${andList(fresh)}`,
    changed > 0 && changedText(changed, changes),
    repeated > 0 &&
      (fresh.length > 0 || changed > 0) &&
      (repeated === 1
        ? '1 filme ficou com a Nota que já tinha'
        : `${repeated} filmes ficaram com a Nota que já tinham`),
  ].filter((part) => part !== false)
  if (sentences.length > 0) return sentences.join('. ')
  return facts === 0 || repeated > 0
    ? 'nada novo, esses filmes já estavam aqui'
    : 'nenhuma Nota nem Já visto novo, só o resto do que ele trazia'
}

/** "O ZIP do Trakt entrou: entraram 2 Notas novas", but a full stop when
 * the first sentence of what it gave has a colon of its own, so two never
 * chain ("O ZIP do Trakt entrou. 1 Nota mudou: Maré Baixa…", #274). */
const entered = (head: string, done: Gave) => {
  const body = gave(done)
  const first = body.split('. ')[0] ?? body
  return first.includes(':')
    ? `${head}. ${body.charAt(0).toLocaleUpperCase('pt-BR')}${body.slice(1)}`
    : `${head}: ${body}`
}

const left = (outside = 0) =>
  outside === 0
    ? ''
    : ` ${count(outside, 'filme ficou', 'filmes ficaram')} de fora: o Catálogo do filmes não tem.`

/** Whose films went through the resolution queue: Letterboxd's, the TV
 * Time backup's (#300), or both. */
export type Resolved = 'letterboxd' | 'tvtime' | 'both'

const RESOLVED: Record<Resolved, string> = {
  letterboxd: 'Letterboxd',
  tvtime: 'TV Time',
  both: 'Letterboxd e TV Time',
}

const QUEUED_FROM: Record<Resolved, string> = {
  letterboxd: 'do Letterboxd',
  tvtime: 'do TV Time',
  both: 'do Letterboxd e do TV Time',
}

const UNAVAILABLE =
  'Não deu para abrir os imports: o site está com um problema, e ele ficou registrado no log do servidor.'

const KINDS: Record<string, string> = {
  letterboxd: 'ZIP do Letterboxd',
  'letterboxd-rss': 'Perfil do Letterboxd',
  trakt: 'ZIP do Trakt',
  imdb: 'CSV do IMDb',
  simkl: 'Backup do Simkl',
  tvtime: 'Backup do TV Time',
}

/** The Letterboxd user of an RSS import's address, `@nome`. */
export const rssUser = (address: string) => {
  const user = /letterboxd\.com\/([A-Za-z0-9_]+)/i.exec(address)?.[1]
  return user === undefined ? null : `@${user}`
}

export const PERSON_IMPORTS = {
  /** Back to her page: Meu gosto, or her name. */
  back: (name: string, own: boolean) => (own ? 'Meu gosto' : name),
  title: (name: string, own: boolean) =>
    own ? 'Importar Notas' : `Importar as Notas de ${name}`,
  lead: (name: string, own: boolean) =>
    own
      ? 'Traga o que você já viu e as Notas que deu em outro site. O filmes guarda o arquivo e lê esses filmes.'
      : `Traga o que ${name} já viu e as Notas que deu em outro site. O filmes guarda o arquivo e lê esses filmes.`,
  unknown: 'Nenhuma Pessoa com esse nome no repo de dados.',
  unavailable: UNAVAILABLE,
  /** After a notice of a replaced Nota: where to change it back. */
  changedLink: 'Ver e mudar as Notas',
  notices: {
    letterboxd: (done: Gave) =>
      `${entered('O ZIP do Letterboxd entrou', done)}.`,
    rss: (done: Gave) => `${entered('Perfil do Letterboxd lido', done)}.`,
    trakt: (done: Gave) =>
      `${entered('O ZIP do Trakt entrou', done)}.${left(done.outside)}`,
    imdb: (done: Gave) =>
      `${entered('O CSV do IMDb entrou', done)}.${left(done.outside)}`,
    simkl: (done: Gave) =>
      `${entered('O backup do Simkl entrou', done)}.${left(done.outside)}`,
    tvtime: (done: Gave) =>
      `${entered('O backup do TV Time entrou', done)}.${left(done.outside)}`,
    repetido: () => 'Esse arquivo já tinha entrado antes: nada mudou.',
    sincronizado: (done: Gave) =>
      done.facts === 0
        ? `Trakt lido: nada novo desde a última vez.${left(done.outside)}`
        : `${entered('Trakt lido', done)}.${left(done.outside)}`,
    reconectar: (done: Gave) =>
      `O Trakt recusou a conexão, então o perfil público foi lido: ${done.facts === 0 ? 'nada novo desde a última vez' : gave(done)}.${left(done.outside)} Conecte o Trakt de novo para voltar a ler e enviar o histórico.`,
    removido: (done: Gave) =>
      done.facts === 0
        ? 'Import tirado. Nada saiu do gosto: outro import trazia o mesmo.'
        : 'Import tirado: o que só ele trazia saiu do gosto.',
  } satisfies Record<ImportNotice, (done: Gave) => string>,
  refusals: {
    pedido: 'Faltou um campo, ou um valor não vale. Confira o formulário.',
    arquivo:
      'Não deu para ler esse arquivo. Envie o ZIP como o site te deu, sem abrir, ou o CSV do IMDb como ele veio.',
    origem:
      'Esse arquivo não parece ser do Letterboxd, do Trakt, do IMDb, do Simkl nem do TV Time. Confira os passos acima.',
    grande:
      'O arquivo passa de 20 MB. O ZIP do Letterboxd, do Trakt ou do Simkl e o CSV do IMDb costumam ter poucos MB: confira se é o certo.',
    consentimento:
      'Sem o sim da Pessoa, o filmes não lê o diário do Letterboxd. Pergunte e marque a caixa.',
    usuario:
      'Isso não é um nome de perfil do Letterboxd. Use só o nome, que aparece no endereço do perfil (letterboxd.com/nome), ou o endereço inteiro.',
    rss: 'O Letterboxd não tem um perfil com esse nome. Confira como ele aparece no endereço do perfil (letterboxd.com/nome).',
    fonte: 'O Letterboxd não respondeu agora. Tente de novo daqui a pouco.',
    item: 'Esse import já não está aqui: alguém o tirou.',
    'trakt-usuario':
      'O Trakt não tem um perfil com esse nome. Use o nome que aparece no endereço do perfil (trakt.tv/users/nome).',
    'trakt-privado':
      'Esse perfil do Trakt é privado. Torne-o público no Trakt, ou conecte a conta (só a própria Pessoa pode conectar).',
    'trakt-sem':
      'Ainda não há Trakt para ler: conecte a conta ou escreva o nome do perfil público.',
    'trakt-off':
      'Este site ainda não lê o Trakt. Use o ZIP do Trakt, em De outro site.',
    'trakt-fonte': 'O Trakt não respondeu agora. Tente de novo daqui a pouco.',
    indisponivel: 'Não deu para importar agora. Tente de novo daqui a pouco.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  } satisfies Record<ImportRefusal, string>,

  /** What the imports gave, first once there is any. */
  results: {
    title: 'O que já entrou',
    /** The films that went through the resolution: Letterboxd's, and the
     * TV Time backup's, which go through the same one. */
    letterboxd: (films: number, from: Resolved = 'letterboxd') =>
      `${RESOLVED[from]}: ${count(films, 'filme', 'filmes')}`,
    found: 'achados',
    outside: 'deixados de fora',
    waiting: 'esperam você',
    seeOutside: (n: number) =>
      n === 1 ? 'Ver o filme deixado de fora' : `Ver os ${n} deixados de fora`,
    /** Why another site's film was left out (#274). */
    notInCatalog: 'o Catálogo do filmes não tem',
    /** A left-out film the site gave with no name. */
    unnamed: 'Filme sem nome',
    /** What another site gave, by film, in the words of its notice
     * (#274): "TV Time: 2 Notas, 1 Já visto e 1 filme na watchlist". A
     * rated film is no Já visto of its own. */
    site: (site: string, films: SourceFilms) =>
      `${site}: ${filmsText(films) ?? 'nenhum filme do Catálogo'}`,
    /** Her own page, Trakt not connected (#274): the recommended way,
     * also here once something came in. */
    traktOff: 'Trakt não conectado',
    traktConnect: 'Conectar o Trakt',
    queued: (n: number, from: Resolved = 'letterboxd') =>
      n === 1
        ? `1 filme ${QUEUED_FROM[from]} espera você confirmar qual é`
        : `${n} filmes ${QUEUED_FROM[from]} esperam você confirmar qual é`,
    queuedLead:
      'O filmes não achou estes sozinho no Catálogo. Até você confirmar, as Notas deles não contam.',
    toQueue: 'Resolver agora',
    /** The sources kept in sync, and when they were read (#274). Each
     * profile row reads it again with the same verb, "Ler agora". */
    sync: {
      trakt: 'lido a cada Sessão nova',
      rss: 'lido quando você pede',
      last: (date: string) => `última leitura em ${shortDate(date)}`,
      now: 'Ler agora',
      traktLabel: 'Ler agora o Trakt',
      rssLabel: (user: string) => `Ler agora o perfil ${user} do Letterboxd`,
    },
    again: 'Importar de novo ou de outro site',
  },
  files: {
    title: 'Arquivos e perfis',
    lead: 'Tirar um import tira as Notas e os Já vistos que só ele trazia.',
    /** A Trakt read names the profile it read, as the profile form does
     * (#274), or her connected account. */
    kind: (kind: string, original = '') =>
      kind === 'trakt-api'
        ? original.startsWith('@')
          ? 'Perfil do Trakt'
          : 'Conta do Trakt'
        : (KINDS[kind] ?? kind),
    on: (date: string) => `em ${shortDate(date)}`,
    remove: 'Tirar',
    removeLabel: (original: string) => `Tirar ${original}`,
    /** `gives`: what this file alone brought, when the page can tell
     * (#274): the only file of its site. */
    removeWarning: (gives: SourceFilms | null) => {
      const what = gives && filmsText(gives)
      return `${what ? `Saem ${what}: o que só este arquivo trazia.` : 'O que só este arquivo trazia sai do gosto.'} As decisões da fila continuam valendo.`
    },
    removeConfirm: 'Tirar este import',
    removeBusy: 'Tirando…',
  },
  /** The guided Letterboxd flow (#270): the ZIP once, the profile after. */
  letterboxd: {
    title: 'Do Letterboxd',
    lead: 'O Letterboxd não deixa outro site entrar na conta. Então são dois caminhos: o ZIP traz o histórico inteiro, uma vez, e o perfil mantém em dia.',
    open: {
      title: 'Abra a página de dados do Letterboxd',
      text: 'Entre com a conta, pelo navegador do celular ou do computador: o app do Letterboxd não exporta.',
      href: 'https://letterboxd.com/settings/data/',
      link: 'Abrir letterboxd.com/settings/data',
    },
    export: {
      title: 'Toque em “Export your data”',
      text: 'O Letterboxd baixa na hora um ZIP com o diário, as Notas e a watchlist. Não precisa abrir o ZIP.',
    },
    send: {
      title: 'Envie o ZIP aqui',
      file: 'ZIP do Letterboxd',
      wrongType:
        'Esse não é o ZIP do Letterboxd: ele termina em .zip. Envie como baixou, sem abrir.',
      submit: 'Importar o ZIP',
      busy: 'Importando…',
    },
    profile: {
      title: 'Para manter em dia: o perfil',
      /** Before the first read the button is "Ler o perfil"; after it,
       * "Ler agora" (#274). */
      text: (read: boolean) =>
        `Depois do ZIP, o filmes lê do perfil público as 50 entradas mais recentes do diário. ${read ? 'Quando registrar filmes novos, toque em “Ler agora”.' : 'Escreva o nome do perfil e toque em “Ler o perfil”.'}`,
    },
  },
  rss: {
    title: 'Perfil do Letterboxd',
    user: 'Nome do perfil no Letterboxd',
    userHint: 'como em letterboxd.com/nome',
    consent: (name: string) =>
      `${name} concordou que o filmes leia o diário público do Letterboxd e guarde as Notas`,
    submit: 'Ler o perfil',
    /** A profile read before: the same "Ler agora" as the results. */
    update: (user: string) => `Ler agora (${user})`,
    other: 'Ler outro perfil',
    busy: 'Lendo o perfil…',
  },
  /** The Trakt ZIP, folded in the Trakt slip (#274). */
  trakt: {
    href: 'https://trakt.tv/settings/data',
    steps: [
      'Abra trakt.tv/settings/data, com a conta do Trakt, pelo computador.',
      'Em “Export”, baixe o ZIP dos dados.',
      'Envie o ZIP aqui, sem abrir.',
    ],
    file: 'ZIP do Trakt',
    wrongType: 'Esse não é o ZIP do Trakt: ele termina em .zip.',
    submit: 'Importar o ZIP do Trakt',
    busy: 'Importando…',
  },
  /** The other services, behind the Letterboxd flow and Trakt. */
  other: {
    title: 'De outro site',
    lead: 'IMDb, Simkl ou o backup do TV Time: baixe o arquivo no site de cada um, pelo computador, e envie aqui como veio.',
    file: 'Arquivo do IMDb, do Simkl ou do TV Time',
    wrongType:
      'Esse arquivo não é de nenhum deles: o Simkl e o TV Time dão um .zip, e o IMDb um .csv.',
    how: (service: string) => `Como baixar do ${service}`,
    services: [
      {
        service: 'IMDb',
        href: 'https://www.imdb.com/list/ratings',
        steps: [
          'Abra “Your Ratings” no IMDb, com a conta.',
          'No menu da lista, toque em “Export”; o CSV fica pronto em “Exports”.',
          'Baixe o CSV e envie aqui.',
        ],
      },
      {
        service: 'Simkl',
        href: 'https://docs.simkl.org/how-to-use-simkl/advanced-usage/import-export-data/exporting-from-simkl/export-data-formats',
        steps: [
          'No Simkl, abra “Apps” e depois “Export”.',
          'Escolha “.zip archive with .json file” e baixe.',
          'Envie o ZIP aqui, sem abrir.',
        ],
      },
      {
        service: 'TV Time',
        // Shut down in July 2026: nothing to download any more, only the
        // backup kept from before, so no link.
        href: null,
        steps: [
          'O TV Time fechou em julho de 2026: vale o backup que você guardou.',
          'O gdpr-data.zip que o TV Time mandou, ou o tv-time-export.zip do TV Time Liberator.',
          'Envie o ZIP aqui, sem abrir.',
        ],
      },
    ],
    submit: 'Importar',
    busy: 'Importando…',
  },
  /** The file picker: before a file, after one. */
  picker: {
    pick: 'Escolher o arquivo',
    none: 'Nenhum arquivo escolhido',
    change: 'Tocar para trocar',
  },
} as const
