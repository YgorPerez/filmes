import {
  reportSource,
  type PersonNotice,
  type PersonRefusal,
} from '#/content/person-action'
import { PEOPLE } from './people.copy'

type Link =
  | 'director'
  | 'writer'
  | 'cast'
  | 'series'
  | 'genre'
  | 'cinematography'
  | 'producer'
type Level = 'none' | 'low' | 'normal' | 'high'
type Reaction = 'love' | 'like' | 'dislike' | 'hate'
type Strength = 'strong' | 'moderate' | 'weak' | 'guess'

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const PERSON = {
  back: 'Pessoas',
  myTaste: 'Meu gosto',
  /** Meu gosto's line under the h1: the name the Sessões give her. */
  ownName: (name: string, aliases: readonly string[]) => {
    const others = namesOnly(aliases)
    return others.length === 0
      ? `Nas Sessões, você é ${name}.`
      : `Nas Sessões, você é ${name} (também ${others.join(', ')}).`
  },
  glance: {
    title: 'Seu gosto em uma olhada',
    notes: (n: number) =>
      n === 1 ? '1 Nota' : `${n.toLocaleString('pt-BR')} Notas`,
    toTen: (n: number) => `faltam ${10 - n} para 10`,
    /** The genres and directors of the films she liked, each part with
     * its label (#274). */
    likes: (genres: readonly string[], directors: readonly string[]) => {
      const parts = [
        genres.length > 0 &&
          `${genres.length === 1 ? 'do gênero' : 'dos gêneros'} ${listed(genres)}`,
        directors.length > 0 && `da direção de ${listed(directors)}`,
      ].filter((part) => part !== false)
      return `Pelas suas Notas, você gosta ${parts.join(' e ')}.`
    },
    said: 'O que você disse',
    nothingSaid: 'Nada dito ainda sobre o seu gosto.',
    next: 'Próximo passo',
    steps: {
      rate: 'dar notas a filmes que você viu',
      connector: 'ligar o conector no Claude',
      questions: 'responder as perguntas abertas',
      queue: (n: number) =>
        n === 1
          ? 'dizer qual é o filme que espera na fila'
          : `dizer quais são os ${n} filmes que esperam na fila`,
      ask: 'pedir um filme para hoje',
    },
  },
  /** The fold of a ficha with nothing yet (#273): "Já vistos sem Nota:
   * nenhum", its + the way to add one. */
  empty: (title: string) => `${title}: nenhum`,
  /** Another Pessoa's page under her name (#273): how much the filmes knows
   * of her, and the one thing to do next. */
  summary: {
    notes: (n: number) =>
      n === 1 ? '1 Nota' : `${n.toLocaleString('pt-BR')} Notas`,
    vetoes: (n: number) => (n === 1 ? '1 Veto' : `${n} Vetos`),
    questions: (n: number) =>
      n === 1 ? '1 pergunta aberta' : `${n} perguntas abertas`,
    sessions: (n: number) => (n === 1 ? '1 Sessão' : `${n} Sessões`),
    unknown: 'falta conhecer',
    /** What her Notas say she likes (#273): her genres and directors. */
    likes: (name: string, names: readonly string[]) =>
      `Pelas Notas, ${name} gosta de ${listed(names)}.`,
    /** Without genres to say, the films of her highest Notas. */
    liked: (name: string, titles: readonly string[]) =>
      `${name} deu nota alta a ${listed(titles)}.`,
    next: 'Próximo passo',
    /** The next step, a button: short, it is in capitals (#273). */
    steps: {
      import: (name: string) => `Trazer o histórico de ${name}`,
      questions: (n: number) =>
        n === 1 ? 'Responder a pergunta' : 'Responder as perguntas',
      veto: (name: string) => `Dizer o que ${name} não vê`,
      ask: (name: string) => `Pedir um filme com ${name}`,
    },
  },
  /** The fold of what fine-tunes her taste: Ajustes, Declarados, Relatos,
   * Acesso. */
  refine: (titles: readonly string[]) => `Afinar: ${listed(titles)}`,
  sessions: {
    title: (name: string) => `Sessões com ${name}`,
    /** Her Satisfação in words: the mean of her reactions, 0 to 1. */
    satisfaction: (name: string, value: number, n: number) => {
      const how =
        value >= 0.75
          ? 'tem saído contente'
          : value >= 0.5
            ? 'tem saído mais ou menos'
            : 'tem saído sem gostar muito'
      const of = n === 1 ? 'da última Sessão' : `das últimas ${n} Sessões`
      return `${name} ${how} ${of} em que disse o que achou.`
    },
    noReaction: (name: string) =>
      `${name} ainda não disse o que achou de nenhuma.`,
    /** Her reaction to one Session's film, in words. */
    reaction: (value: number | null) =>
      value === null
        ? 'sem reação'
        : value >= 0.75
          ? 'gostou'
          : value >= 0.45
            ? 'mais ou menos'
            : 'não gostou',
    nothingChosen: 'sem filme escolhido',
  },
  removePerson: {
    title: 'Remover Pessoa',
    lead: (name: string) =>
      `Para quem entrou por engano: o arquivo de ${name} sai.`,
    open: (name: string) => `Remover ${name}`,
    warning: (name: string) =>
      `${name} sai das Pessoas, com os Vetos, os Declarados e as Notas dadas aqui. Não dá para desfazer.`,
    confirm: (name: string) => `Remover ${name} de vez`,
    busy: 'Removendo…',
    owner: (name: string) =>
      `${name} entra no site: tire o acesso antes de remover.`,
    sessions: (name: string, n: number) =>
      `${name} está em ${n === 1 ? '1 Sessão' : `${n} Sessões`}: o arquivo fica, para elas continuarem lendo o gosto.`,
    imported: (name: string) =>
      `${name} tem histórico importado: tire as importações antes de remover.`,
  },
  notes: {
    title: 'Notas',
    predictionError: (error: number, films: number) => {
      const rounded = Math.round(error * 10) / 10
      const points = rounded < 2 ? 'ponto' : 'pontos'
      return `a previsão erra ${rounded.toLocaleString('pt-BR')} ${points} em média, em ${films.toLocaleString('pt-BR')} filmes`
    },
    rate: 'Dar notas',
    import: 'Importar de outro site',
    more: 'Baixar as Notas:',
    download: 'CSV do IMDb',
    downloadLetterboxd: 'CSV do Letterboxd',
    /** Each Nota of the list: change it on Dar notas, or take it out. */
    change: 'Mudar',
    changeLabel: (title: string) => `Mudar a Nota de ${title}`,
    removeWhat: (title: string) => `a Nota de ${title}`,
    /** Her Trakt connection, under the buttons (#274). */
    trakt: {
      state: (connected: boolean) =>
        connected ? 'Trakt conectado' : 'Trakt não conectado',
      link: (connected: boolean) => (connected ? 'ver a conexão' : 'conectar'),
    },
    /** For an admin: why and where the CSVs go (#274, #276). */
    movielens: (own: boolean, n: number, name: string) => {
      const notes = n === 1 ? 'a Nota' : `as ${n.toLocaleString('pt-BR')} Notas`
      return own
        ? `Para levar ${notes} a outro serviço. No MovieLens, o CSV do IMDb entra em Import or Export Data, como avaliações do IMDb. No Letterboxd, o outro CSV leva as Notas e os Já vistos ao seu diário, pelo import de dados.`
        : `Para levar ${notes} de ${name} a outro serviço. No MovieLens, o CSV do IMDb entra em Import or Export Data, como avaliações do IMDb. No Letterboxd, o outro CSV leva as Notas e os Já vistos ao diário de ${name}, pelo import de dados.`
    },
    retry: 'Baixar de novo:',
    retryImdb: 'CSV do IMDb',
    retryLetterboxd: 'CSV do Letterboxd',
    pending: (n: number) =>
      n === 1 ? '1 filme espera você' : `${n} filmes esperam você`,
    resolve: 'Resolver na fila',
    list: (n: number) => (n === 1 ? 'Ver a Nota' : `Ver as ${n} Notas`),
    empty: (own: boolean, name: string) =>
      own
        ? 'Nenhuma Nota ainda. Dê nota a filmes que você já viu, ou traga o seu histórico.'
        : `Nenhuma Nota ainda. Traga o histórico de ${name} do Letterboxd, do Trakt, do IMDb ou do Simkl.`,
    noDatabase: 'As Notas aparecem depois que o banco for reconstruído.',
  },
  contents: 'Nesta página',
  owner: 'Dono',
  aliases: (aliases: readonly string[]) =>
    namesOnly(aliases).length === 0
      ? null
      : `também ${namesOnly(aliases).join(', ')}`,
  unknown: {
    title: 'Pessoa não encontrada',
    lead: 'Ninguém com esse nome nas Pessoas. O endereço pode ter mudado, ou a Pessoa foi removida.',
    back: 'Ver as Pessoas',
  },
  unavailable:
    'Não deu para abrir a Pessoa: o site está com um problema, e ele ficou registrado no log do servidor.',
  /** Correcting an item in place (#330). */
  edit: {
    open: 'Editar',
    label: (what: string) => `Editar ${what}`,
    cancel: 'Cancelar',
    /** Above the open form: which item it is, as it was. */
    heading: (kind: string) => `Editando ${kind}`,
    kinds: {
      veto: 'o Veto',
      stated: 'o Declarado',
      report: 'o Relato',
      seen: 'o Já visto',
    },
    /** In an item's line: the day of its last edit, after its own date. */
    on: (date: string) => `editado ${date}`,
    /** Beside the item an edit just saved. */
    saved: 'Editado',
    /** Another "Editar", or Esc, while the open form has changes. */
    held: 'Esta edição tem mudanças: grave ou cancele antes de sair dela.',
    /** A Já visto's film stays: another film is another Já visto. */
    filmFixed: 'Para trocar o filme, tire este Já visto e acrescente o certo.',
    /** The Fonte of an edit: left empty, the one it had stays. */
    sourceHint: 'de onde veio; apagada, fica a de antes',
    /** Why an imported item has no "Editar", for a screen reader. */
    readOnly: 'corrija na origem',
  },
  remove: 'Tirar',
  removeLabel: (what: string) => `Tirar ${what}`,
  removing: 'Tirando…',
  /** "Tirar" asks first (#330). */
  removeSure: (what: string) => `Tirar ${what} de vez`,
  removeSureShort: 'Tirar de vez',
  removeKeep: 'Manter',
  removeWarning: 'Sai do arquivo e não volta.',
  save: 'Gravar',
  saving: 'Gravando…',
  imported: 'importado',
  fromFeedback: 'do Feedback',
  /** What a save or a Tirar did, by the ficha that posted it (#273):
   * "Veto gravado.", not where the file is. */
  savedIn: {
    vetos: {
      gravado: 'Veto gravado.',
      removido: 'Veto tirado.',
      editado: 'Veto editado.',
    },
    declarados: {
      gravado: 'Declarado gravado.',
      removido: 'Declarado tirado.',
      editado: 'Declarado editado.',
    },
    relatos: {
      gravado: 'Relato gravado.',
      removido: 'Relato tirado.',
      editado: 'Relato editado.',
    },
    vistos: {
      gravado: 'Já visto gravado.',
      removido: 'Já visto tirado.',
      editado: 'Já visto editado.',
    },
  } satisfies Record<string, Partial<Record<PersonNotice, string>>>,
  /** What the last form did, by her name (#273): every Pessoa is not
   * "ela". */
  notices: (name: string) =>
    ({
      gravado: 'Gravado.',
      igual: 'Já estava assim: nada mudou.',
      ajustado: 'Ajuste gravado.',
      removido: 'Tirado.',
      editado: 'Editado.',
      pulada: 'Pergunta pulada: volta uma vez, quando o assunto aparecer.',
      saiu: 'Pulada duas vezes: a pergunta saiu da lista.',
      respondida: 'Resposta gravada como Declarado; a pergunta saiu da lista.',
      criada: `Pessoa criada. Conte aqui o gosto de ${name}.`,
      'acesso-dado': `Acesso dado: ${name} já entra no site e no conector com esse e-mail.`,
      'acesso-tirado': `Acesso tirado: ${name} não entra mais. O gosto continua aqui.`,
      removida: 'Pessoa removida.',
    }) satisfies Record<PersonNotice, string>,
  refusals: (name: string) =>
    ({
      alvo: 'Esse filme ou nome não está no Catálogo. Busque de novo e escolha um resultado.',
      pedido:
        'Faltou um campo, ou um valor não vale: confira o texto, o alvo e a Nota de 1 a 10.',
      item: `Esse item já não está no arquivo de ${name}.`,
      repetido: `Assim ele ficaria igual a outro item do arquivo de ${name}. Nada mudou.`,
      email: `Para entrar, ${name} precisa de um e-mail do Google válido.`,
      'email-usado': 'Esse e-mail já é de outra Pessoa.',
      'ja-dono': `${name} já tem acesso. Para trocar o e-mail, tire o acesso antes.`,
      'proprio-acesso': 'O seu próprio acesso não sai por aqui.',
      'e-dono': `${name} entra no site: tire o acesso antes de remover.`,
      'tem-import': `${name} tem histórico importado: tire as importações antes de remover.`,
      'em-sessao': `${name} está numa Sessão: o arquivo fica, para a Sessão continuar lendo o gosto.`,
      exportar: 'Não deu para gerar o CSV agora. Tente de novo daqui a pouco.',
      indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
      falha:
        'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
    }) satisfies Record<PersonRefusal, string>,

  // Fields.
  text: 'O que foi dito',
  /** The target's field (#273): a search, not an ID to paste. */
  target: 'Diga o quê: um filme, uma pessoa, um gênero ou um grupo',
  statementTarget: 'Sobre o quê',
  targetHint: 'opcional: um filme, uma pessoa, um gênero ou uma série',
  targetSearch: 'Busque pelo nome',
  /** Before the JavaScript, the field takes the ID. */
  idHint: 'tt… de um filme ou Q… de uma pessoa, gênero ou série',
  groupsLabel: 'ou, em vez disso, um grupo',
  targetChip: (label: string, kind: string) => `${label} · ${kind}`,
  film: 'Filme',
  filmKind: 'filme',
  clearTarget: (label: string) => `Trocar ${label}`,
  reaction: 'Reação',
  noReaction: 'só menciona',
  source: 'Fonte',
  sourceHint: (fallback: string) => `opcional; sem ela, “${fallback}”`,
  ownSourceHint: 'opcional; sem ela, conta como dito por você',
  filmHint: 'tt… do Catálogo',
  rating: 'Nota',
  noRating: 'sem Nota',
  noGroup: 'nenhum',

  questions: {
    title: 'Perguntas abertas',
    empty: 'Nenhuma pergunta aberta.',
    skips: (n: number) => (n === 1 ? 'pulada 1 vez' : `pulada ${n} vezes`),
    answer: 'Responder com palavras',
    answerText: (name: string) => `A resposta de ${name}`,
    skip: 'Pular',
    skipping: 'Pulando…',
    /** One tap answers (#273): what she said, as the Declarado's text. */
    likes: 'Curte',
    dislikes: 'Não curte',
    likesText: (about: string | null) =>
      about === null ? 'curte' : `curte ${about}`,
    dislikesText: (about: string | null) =>
      about === null ? 'não curte' : `não curte ${about}`,
  },
  vetoes: {
    title: 'Vetos',
    empty: 'Nenhum Veto.',
    add: 'Acrescentar Veto',
    text: 'O Veto, como foi dito',
    placeholder: 'nunca vê terror',
  },
  adjustments: {
    title: 'Ajustes',
    lead: (name: string) =>
      `O quanto conta, para ${name}, um filme ter a mesma direção, o mesmo elenco ou o mesmo gênero de outro. O que foi dito sobre um nome continua valendo.`,
    ownLead:
      'O quanto conta, para você, um filme ter a mesma direção, o mesmo elenco ou o mesmo gênero de outro. O que você disse sobre um nome continua valendo.',
    /** What each level does, one line (#273). */
    levelsHint:
      'nada: não conta · pouco: conta metade · muito: conta uma vez e meia',
    /** The two groups of Ajustes (#273): who made the film, and what it
     * is. */
    groups: {
      people: 'Pessoas do filme',
      film: 'Do filme',
    },
    changed: (n: number) =>
      n === 1 ? '1 fora do normal' : `${n} fora do normal`,
    noneChanged: 'todos normais',
    /** Beside the Ajuste just saved, after its ✓. */
    saved: 'Ajuste gravado',
    level: (link: string) => `Ajuste de ${link}`,
    change: 'Mudar',
  },
  stated: {
    title: 'Declarados',
    lead: (name: string) => `O que ${name} disse do próprio gosto.`,
    ownLead: 'O que você disse do seu gosto.',
    empty: 'Nenhum Declarado.',
    add: 'Acrescentar Declarado',
    source: 'conversa com o Dono',
  },
  reports: {
    title: 'Relatos',
    lead: (name: string) => `O que um Dono contou do gosto de ${name}.`,
    ownLead: 'O que outro Dono contou do seu gosto.',
    empty: 'Nenhum Relato.',
    add: 'Acrescentar Relato',
    source: reportSource,
  },
  seen: {
    title: 'Já vistos',
    empty: 'Nenhum Já visto dito aqui. As Notas do site ficam nas Notas.',
    add: 'Acrescentar Já visto',
    source: 'conversa com o Dono',
  },
  access: {
    title: 'Acesso',
    lead: (name: string) =>
      `Com acesso, ${name} vira Dono: entra no site e no conector do Claude com o e-mail do Google e vê tudo da casa.`,
    none: 'Sem acesso.',
    owner: (email: string | null) =>
      email === null ? 'Tem acesso.' : `Entra com ${email}.`,
    email: PEOPLE.create.email,
    grant: 'Dar acesso',
    testUsers: PEOPLE.create.testUsers,
    revoke: 'Tirar acesso',
    revokeWarning: (name: string) =>
      `${name} não entra mais no site nem no Claude. O gosto fica.`,
    revokeConfirm: (name: string) => `Tirar o acesso de ${name}`,
    revoking: 'Tirando…',
  },

  /** The Ajustes, in their two groups (#273): who made the film, then
   * what the film is. */
  links: {
    director: 'direção',
    writer: 'roteiro',
    cast: 'elenco',
    cinematography: 'fotografia',
    producer: 'produção',
    series: 'série',
    genre: 'gênero',
  } satisfies Record<Link, string>,
  linkGroups: {
    people: ['director', 'writer', 'cast', 'cinematography', 'producer'],
    film: ['series', 'genre'],
  } satisfies Record<'people' | 'film', readonly Link[]>,
  levels: {
    none: 'nada',
    low: 'pouco',
    normal: 'normal',
    high: 'muito',
  } satisfies Record<Level, string>,
  reactions: {
    love: 'ama',
    like: 'gosta de',
    dislike: 'não gosta de',
    hate: 'odeia',
  } satisfies Record<Reaction, string>,
  strengths: {
    strong: 'forte',
    moderate: 'moderada',
    weak: 'fraca',
    guess: 'palpite',
  } satisfies Record<Strength, string>,
  /** A Declarado with no reaction, as the page says it. */
  about: 'sobre',
  /** A Declarado's text: a Letterboxd tag in words, the rest in quotes. */
  statementText: (text: string) => {
    const tag = /^tag: (.+)$/.exec(text)?.[1]
    return tag === undefined ? `“${text}”` : `Marcou com a tag “${tag}”`
  },
  /** Where a target's title leads: the film on the IMDb, an entity on the
   * Wikidata. */
  targetUrl: (id: string) =>
    id.startsWith('tt')
      ? `https://www.imdb.com/title/${id}/`
      : `https://www.wikidata.org/wiki/${id}`,
  /** An engine label in plain words: "tag: chuva" is the tag “chuva”. */
  plainLabel: (label: string) => label.replace(/^tag: (.+)$/, 'a tag “$1”'),
  /** A Nota on the 1 to 10 scale she gives it on (the rating screen, the
   * Cartaz's Já vi): the engine keeps it from 0,5 to 5, so 4.5 is "nota 9"
   * (#268). */
  ratingText: (rating: number) => `nota ${tenScale(rating)}`,
  /** Where a Nota came from, by its service on the page of the Pessoa
   * (`name`), with the stars it had there when the source rates on 5:
   * "Letterboxd (4,5★)". */
  ratingSource: (rating: number, source: string | null, name = '') => {
    if (source === null) return null
    // The rating screen's Notas (the engine's `RATING_SCREEN_SOURCE`).
    if (source === 'notas no site') return 'Dar notas'
    // "Letterboxd do Bruno" on Bruno's own page: the service alone (#274).
    const service =
      name === ''
        ? null
        : (new RegExp(`^(.+?) d[eoa] ${escapeRegExp(name)}$`).exec(
            source,
          )?.[1] ?? null)
    const label = service ?? source
    return /letterboxd/i.test(label)
      ? `${label} (${String(rating).replace('.', ',')}★)`
      : label
  },
  /** What is wrong with a field, under it (`formProblem`). */
  fieldProblem: ({ field, problem }: { field: string; problem: string }) => {
    if (problem === 'rating') return 'A Nota vai de 1 a 10.'
    if (problem === 'film')
      return field === 'filme'
        ? 'Falta o filme: busque pelo título e escolha um resultado.'
        : 'O filme é o tt… dele no Catálogo.'
    if (problem === 'id')
      return 'Busque pelo nome e escolha um resultado do Catálogo.'
    if (problem === 'target')
      return 'Falta o alvo: um filme, uma pessoa, um gênero ou um grupo.'
    if (problem === 'both')
      return 'Escolha um só: o alvo ou o grupo. O Veto vale para um deles.'
    if (problem === 'reaction')
      return 'Uma reação precisa de um alvo: diga sobre o quê.'
    return REQUIRED[field] ?? 'Falta preencher este campo.'
  },
} as const

/** The aliases that are names: "eu", how the Dono says herself in the
 * chat, is not one to show. */
const namesOnly = (aliases: readonly string[]) =>
  aliases.filter((alias) => alias.trim().toLowerCase() !== 'eu')

/** The Nota of 0,5 to 5 the engine keeps, on the scale of 1 to 10. */
const tenScale = (rating: number) =>
  String(Math.round(rating * 20) / 10).replace('.', ',')

/** "Vetos, Declarados e Relatos". */
const listed = (titles: readonly string[]) =>
  titles.length === 1
    ? (titles[0] ?? '')
    : `${titles.slice(0, -1).join(', ')} e ${titles.at(-1)}`

const REQUIRED: Record<string, string> = {
  texto: 'Falta o texto: o que foi dito.',
  filme: 'Falta o filme: busque pelo título e escolha um resultado.',
  email: 'Falta o e-mail do Google.',
}
