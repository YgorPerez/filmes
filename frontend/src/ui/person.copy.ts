import {
  reportSource,
  type PersonNotice,
  type PersonRefusal,
} from '#/content/person-action'
import { PEOPLE } from './people.copy'

type Link = 'director' | 'writer' | 'cast' | 'series' | 'genre'
type Level = 'none' | 'low' | 'normal' | 'high'
type Reaction = 'love' | 'like' | 'dislike' | 'hate'
type Strength = 'strong' | 'moderate' | 'weak' | 'guess'

export const PERSON = {
  back: 'Pessoas',
  myTaste: 'Meu gosto',
  /** Meu gosto's line under the h1: the name the Sessões give her. */
  ownName: (name: string, aliases: readonly string[]) =>
    aliases.length === 0
      ? `Nas Sessões, você é ${name}.`
      : `Nas Sessões, você é ${name} (também ${aliases.join(', ')}).`,
  glance: {
    title: 'Seu gosto em uma olhada',
    notes: (n: number) =>
      n === 1 ? '1 Nota' : `${n.toLocaleString('pt-BR')} Notas`,
    toTen: (n: number) => `faltam ${10 - n} para 10`,
    said: 'O que você disse',
    nothingSaid: 'Nada dito ainda sobre o seu gosto.',
    next: 'Próximo passo',
    steps: {
      rate: 'dar notas a filmes que você viu',
      connector: 'ligar o conector no Claude',
      questions: 'responder as perguntas abertas',
      ask: 'pedir um filme para hoje',
    },
  },
  /** The fold of the fichas with nothing yet: "Vetos e Declarados: nada
   * ainda". */
  empties: (titles: readonly string[]) =>
    `${titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} e ${titles.at(-1)}`}: nada ainda`,
  notes: {
    title: 'Notas',
    predictionError: (error: number, films: number) => {
      const rounded = Math.round(error * 10) / 10
      const points = rounded < 2 ? 'ponto' : 'pontos'
      return `a previsão erra ${rounded.toLocaleString('pt-BR')} ${points} em média, em ${films.toLocaleString('pt-BR')} filmes`
    },
    rate: 'Dar notas',
    import: 'Importar do Letterboxd ou do Trakt',
    download: 'Baixar CSV do IMDb',
    movielens:
      'O CSV entra no MovieLens em Import or Export Data, como avaliações do IMDb.',
    list: (n: number) => (n === 1 ? 'Ver a Nota' : `Ver as ${n} Notas`),
    empty: (own: boolean) =>
      own
        ? 'Nenhuma Nota ainda. Dê nota a filmes que você já viu, ou traga o seu histórico.'
        : 'Nenhuma Nota ainda. Traga o histórico dela do Letterboxd ou do Trakt.',
    noDatabase: 'As Notas aparecem depois que o banco for reconstruído.',
  },
  contents: 'Nesta página',
  owner: 'Dono',
  aliases: (aliases: readonly string[]) => `também ${aliases.join(', ')}`,
  unknown: 'Nenhuma Pessoa com esse nome no repo de dados.',
  unavailable:
    'Não deu para abrir a Pessoa: o site está com um problema, e ele ficou registrado no log do servidor.',
  remove: 'Tirar',
  removeLabel: (what: string) => `Tirar ${what}`,
  removing: 'Tirando…',
  save: 'Gravar',
  saving: 'Gravando…',
  imported: 'importado',
  fromFeedback: 'do Feedback',
  /** On Meu gosto, the notices that name whose file it is. */
  ownNotices: {
    gravado: 'Gravado no seu arquivo.',
    removido: 'Tirado do seu arquivo.',
  } satisfies Partial<Record<PersonNotice, string>>,
  notices: {
    gravado: 'Gravado no arquivo dela.',
    igual: 'Já estava assim: nada mudou.',
    ajustado: 'Ajuste gravado.',
    removido: 'Tirado do arquivo dela.',
    pulada: 'Pergunta pulada: ela volta uma vez, quando o assunto aparecer.',
    saiu: 'Pulada duas vezes: a pergunta saiu da lista.',
    respondida: 'Resposta gravada como Declarado; a pergunta saiu da lista.',
    criada: 'Pessoa criada. Conte o gosto dela aqui.',
    'acesso-dado':
      'Acesso dado: ela já entra no site e no conector com esse e-mail.',
    'acesso-tirado':
      'Acesso tirado: ela não entra mais. O gosto dela continua aqui.',
  } satisfies Record<PersonNotice, string>,
  refusals: {
    alvo: 'Esse ID não está no Catálogo. Confira o tt… do filme ou o Q… da entidade.',
    pedido:
      'Faltou um campo, ou um valor não vale: confira o texto, o alvo (tt… ou Q…) e a Nota de 1 a 10.',
    item: 'Esse item já não está no arquivo dela.',
    email: 'Para entrar, ela precisa de um e-mail do Google válido.',
    'email-usado': 'Esse e-mail já é de outra Pessoa.',
    'ja-dono': 'Ela já tem acesso. Para trocar o e-mail, tire o acesso antes.',
    'proprio-acesso': 'O seu próprio acesso não sai por aqui.',
    exportar: 'Não deu para gerar o CSV agora. Tente de novo daqui a pouco.',
    indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  } satisfies Record<PersonRefusal, string>,

  // Fields.
  text: 'O que foi dito',
  target: 'Alvo',
  targetHint: 'opcional: tt… de um filme ou Q… de uma entidade do Catálogo',
  idHint: 'tt… de um filme ou Q… de uma entidade do Catálogo',
  reaction: 'Reação ao alvo',
  noReaction: 'só sobre',
  source: 'Fonte',
  sourceHint: (fallback: string) => `opcional; sem ela, “${fallback}”`,
  film: 'Filme',
  filmHint: 'tt… do Catálogo',
  rating: 'Nota',
  noRating: 'sem Nota',
  group: 'Grupo de tags',
  noGroup: 'nenhum: filme ou entidade pelo ID',

  questions: {
    title: 'Perguntas abertas',
    empty: 'Nenhuma pergunta aberta.',
    skips: (n: number) => (n === 1 ? 'pulada 1 vez' : `pulada ${n} vezes`),
    answer: 'Responder',
    answerText: 'A resposta dela',
    skip: 'Pular',
    skipping: 'Pulando…',
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
    lead: 'Quanto cada elo entre filmes pesa para ela. O que ela disse sobre um nome continua valendo.',
    ownLead:
      'Quanto cada elo entre filmes pesa para você. O que você disse sobre um nome continua valendo.',
    level: (link: string) => `Ajuste de ${link}`,
    change: 'Mudar',
    allNormal: 'Todos no normal: mudar',
    restNormal: 'Os outros no normal: mudar',
  },
  stated: {
    title: 'Declarados',
    lead: 'O que ela disse do próprio gosto.',
    ownLead: 'O que você disse do seu gosto.',
    empty: 'Nenhum Declarado.',
    add: 'Acrescentar Declarado',
    source: 'conversa com o Dono',
  },
  reports: {
    title: 'Relatos',
    lead: 'O que o Dono contou do gosto dela.',
    ownLead: 'O que outro Dono contou do seu gosto.',
    empty: 'Nenhum Relato.',
    add: 'Acrescentar Relato',
    source: reportSource,
  },
  seen: {
    title: 'Já vistos',
    empty: 'Nenhum Já visto dito na conversa.',
    add: 'Acrescentar Já visto',
    source: 'conversa com o Dono',
  },
  access: {
    title: 'Acesso',
    lead: 'Com acesso, ela vira Dono: entra no site e no conector do Claude com o e-mail do Google e vê tudo da casa.',
    none: 'Sem acesso.',
    owner: (email: string | null) =>
      email === null ? 'Tem acesso.' : `Entra com ${email}.`,
    email: PEOPLE.create.email,
    grant: 'Dar acesso',
    testUsers: PEOPLE.create.testUsers,
    revoke: 'Tirar acesso',
    revokeHint:
      'O próximo pedido dela, no site ou no conector, já é recusado. O gosto dela fica.',
  },

  links: {
    director: 'diretor',
    writer: 'roteiro',
    cast: 'elenco',
    series: 'série',
    genre: 'gênero',
  } satisfies Record<Link, string>,
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
  specific: 'específico',
  generic: 'genérico',
  /** An engine label in plain words: "tag: chuva" is the tag “chuva”. */
  plainLabel: (label: string) => label.replace(/^tag: (.+)$/, 'a tag “$1”'),
  /** A Nota on the 1 to 10 scale she gives it on (the rating screen, the
   * Cartaz's Já vi): the engine keeps it from 0,5 to 5, so 4.5 is "nota 9"
   * (#268). */
  ratingText: (rating: number) => `nota ${tenScale(rating)}`,
  /** Where a Nota came from, with the stars it had there when the source
   * rates on 5 (Letterboxd): "4,5★ no Letterboxd da Iara". */
  ratingSource: (rating: number, source: string | null) =>
    source !== null && /letterboxd/i.test(source)
      ? `${String(rating).replace('.', ',')}★ no ${source}`
      : source,
  /** What is wrong with a field, under it (`formProblem`). */
  fieldProblem: ({ field, problem }: { field: string; problem: string }) => {
    if (problem === 'rating') return 'A Nota vai de 1 a 10.'
    if (problem === 'film') return 'O filme é o tt… dele no Catálogo.'
    if (problem === 'id')
      return 'O alvo é um ID do Catálogo: tt… de um filme ou Q… de uma pessoa, gênero ou série.'
    if (problem === 'target')
      return 'Falta o alvo: um filme ou uma entidade pelo ID (tt… ou Q…), ou um grupo de tags.'
    if (problem === 'reaction')
      return 'Uma reação precisa de um alvo: diga o ID (tt… ou Q…) a que ela reage.'
    return REQUIRED[field] ?? 'Falta preencher este campo.'
  },
} as const

/** The Nota of 0,5 to 5 the engine keeps, on the scale of 1 to 10. */
const tenScale = (rating: number) =>
  String(Math.round(rating * 20) / 10).replace('.', ',')

const REQUIRED: Record<string, string> = {
  texto: 'Falta o texto: o que foi dito.',
  filme: 'Falta o filme: o tt… dele no Catálogo.',
  email: 'Falta o e-mail do Google dela.',
}

/** The Notas a form offers, from 10 to 1, as the forms post them. */
export const RATING_CHOICES = Array.from({ length: 10 }, (_, i) => ({
  value: `${10 - i}/10`,
  label: String(10 - i),
}))
