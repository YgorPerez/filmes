import type { PersonNotice, PersonRefusal } from '#/content/person-action'

type Link = 'director' | 'writer' | 'cast' | 'series' | 'genre'
type Level = 'none' | 'low' | 'normal' | 'high'
type Reaction = 'love' | 'like' | 'dislike' | 'hate'
type Strength = 'strong' | 'moderate' | 'weak' | 'guess'

const count = (n: number, one: string, many: string) =>
  n === 0 ? `nenhum ${one}` : n === 1 ? `1 ${one}` : `${n} ${many}`

export const PEOPLE = {
  back: 'Voltar',
  title: 'Pessoas',
  lead: 'Quem assiste com o Dono e o que o filmes sabe do gosto de cada uma.',
  owner: 'Dono',
  aliases: (aliases: readonly string[]) => `também ${aliases.join(', ')}`,
  empty: 'Nenhuma Pessoa no repo de dados ainda.',
  unavailable:
    'As Pessoas ainda não estão prontas neste servidor: falta o banco do filmes.',
  gone: 'Essa Pessoa não está mais no repo de dados.',
} as const

export const PERSON = {
  back: 'Pessoas',
  owner: 'Dono',
  aliases: (aliases: readonly string[]) => `também ${aliases.join(', ')}`,
  unknown: 'Nenhuma Pessoa com esse nome no repo de dados.',
  unavailable: PEOPLE.unavailable,
  remove: 'Tirar',
  removeLabel: (what: string) => `Tirar ${what}`,
  save: 'Gravar',
  imported: 'importado',
  fromFeedback: 'do Feedback',
  notices: {
    gravado: 'Gravado no arquivo dela.',
    igual: 'Já estava assim: nada mudou.',
    ajustado: 'Ajuste gravado.',
    removido: 'Tirado do arquivo dela.',
    pulada: 'Pergunta pulada: ela volta uma vez, quando o assunto aparecer.',
    saiu: 'Pulada duas vezes: a pergunta saiu da lista.',
    respondida: 'Resposta gravada como Declarado; a pergunta saiu da lista.',
  } satisfies Record<PersonNotice, string>,
  refusals: {
    alvo: 'Esse ID não está no Catálogo. Confira o tt… do filme ou o Q… da entidade.',
    pedido: 'Faltou um campo, ou um valor não vale. Confira o formulário.',
    item: 'Esse item já não está no arquivo dela.',
    indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
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
    level: (link: string) => `Ajuste de ${link}`,
    change: 'Mudar',
  },
  stated: {
    title: 'Declarados',
    lead: 'O que ela disse do próprio gosto.',
    empty: 'Nenhum Declarado.',
    add: 'Acrescentar Declarado',
    source: 'conversa com o Dono',
  },
  reports: {
    title: 'Relatos',
    lead: 'O que o Dono contou do gosto dela.',
    empty: 'Nenhum Relato.',
    add: 'Acrescentar Relato',
    source: 'descrição do Dono',
  },
  seen: {
    title: 'Já vistos',
    empty: 'Nenhum Já visto dito na conversa.',
    add: 'Acrescentar Já visto',
    source: 'conversa com o Dono',
  },
  ratings: {
    title: 'Notas importadas',
    lead: 'As Notas em vigor, dos imports e dos Já vistos. Para mudar, importe de novo.',
    count: (n: number) => count(n, 'Nota', 'Notas'),
    empty: 'Nenhuma Nota.',
    noDatabase: 'As Notas aparecem depois que o banco for reconstruído.',
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
  /** A Nota as the engine writes it: 4.5 is "4,5". */
  ratingText: (rating: number) => `nota ${String(rating).replace('.', ',')}`,
} as const

/** The Notas a form offers, on the scale of 0,5 to 5. */
export const RATING_CHOICES = [
  '5',
  '4,5',
  '4',
  '3,5',
  '3',
  '2,5',
  '2',
  '1,5',
  '1',
  '0,5',
] as const
