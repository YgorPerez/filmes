import type { ImportNotice, ImportRefusal } from '#/content/import-action'

const count = (n: number, one: string, many: string) =>
  n === 1 ? `1 ${one}` : `${n} ${many}`

const facts = (n: number) =>
  n === 0 ? 'nenhum Fato novo' : count(n, 'Fato novo', 'Fatos novos')

const UNAVAILABLE =
  'Não deu para abrir os imports: o site está com um problema, e ele ficou registrado no log do servidor.'

const KINDS: Record<string, string> = {
  letterboxd: 'Arquivo do Letterboxd',
  'letterboxd-rss': 'RSS do Letterboxd',
  trakt: 'Arquivo do Trakt',
  imdb: 'CSV do IMDb',
  simkl: 'Backup do Simkl',
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
    imdb: (n: number, outside = 0) =>
      `CSV do IMDb importado: ${facts(n)}.` +
      (outside === 0
        ? ''
        : ` ${count(outside, 'título ficou', 'títulos ficaram')} de fora: o Catálogo não tem.`),
    simkl: (n: number, outside = 0) =>
      `Backup do Simkl importado: ${facts(n)}.` +
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
      'Não deu para ler esse arquivo. Envie o ZIP como o Letterboxd, o Trakt ou o Simkl te deu, sem descompactar, ou o CSV do IMDb como ele veio.',
    origem:
      'Esse arquivo não parece ser do Letterboxd, do Trakt, do IMDb nem do Simkl.',
    grande:
      'O arquivo passa de 20 MB. O ZIP do Letterboxd, do Trakt ou do Simkl e o CSV do IMDb costumam ter poucos MB: confira se é o certo.',
    consentimento:
      'Sem o sim da Pessoa, o filmes não lê o diário do Letterboxd. Pergunte e marque a caixa.',
    rss: 'O Letterboxd não achou esse perfil. Confira o nome no endereço do perfil.',
    fonte: 'O Letterboxd não respondeu agora. Tente de novo daqui a pouco.',
    item: 'Esse import já não está no arquivo dela.',
    indisponivel: 'Não deu para importar agora. Tente de novo daqui a pouco.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
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
  imdb: {
    title: 'IMDb',
    summary: (ratings: number) => `${count(ratings, 'Nota', 'Notas')} do IMDb.`,
  },
  simkl: {
    title: 'Simkl',
    summary: (ratings: number, seen: number) =>
      `${count(ratings, 'Nota', 'Notas')} e ${count(seen, 'Já visto', 'Já vistos')} do Simkl.`,
  },
  upload: {
    title: 'O arquivo do Letterboxd, do Trakt, do IMDb ou do Simkl',
    file: 'Arquivo que o Letterboxd, o Trakt, o Simkl (ZIP) ou o IMDb (CSV) te deu',
    /** How to download the file, one line per service: the service's name
     * links to where it is exported. */
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
      {
        service: 'IMDb',
        href: 'https://www.imdb.com/list/ratings',
        steps: 'Your Ratings › Export; o CSV fica em Exports.',
      },
      {
        service: 'Simkl',
        href: 'https://docs.simkl.org/how-to-use-simkl/advanced-usage/import-export-data/exporting-from-simkl/export-data-formats',
        steps: 'Apps › Export › “.zip archive with .json file”.',
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
