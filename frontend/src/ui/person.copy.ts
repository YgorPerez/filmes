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

export const PERSON = {
  back: 'Pessoas',
  myTaste: 'Meu gosto',
  trakt: 'Conexão com o Trakt',
  notes: {
    title: 'Notas',
    predictionError: (error: number, films: number) => {
      const rounded = Math.round(error * 10) / 10
      const points = rounded < 2 ? 'ponto' : 'pontos'
      return `a previsão erra ${rounded.toLocaleString('pt-BR')} ${points} em média, em ${films.toLocaleString('pt-BR')} filmes`
    },
    rate: 'Dar notas',
    import: 'Importar do Letterboxd, do Trakt, do IMDb ou do Simkl',
    download: 'Baixar CSV do IMDb',
    downloadLetterboxd: 'Baixar CSV do Letterboxd',
    movielens:
      'O CSV do IMDb entra no MovieLens em Import or Export Data, como avaliações do IMDb. O do Letterboxd leva as Notas e os Já vistos ao diário dela, pelo import de dados do Letterboxd.',
    list: (n: number) => (n === 1 ? 'Ver a Nota' : `Ver as ${n} Notas`),
    empty: (own: boolean) =>
      own
        ? 'Nenhuma Nota ainda. Dê nota a filmes que você já viu, ou traga o seu histórico.'
        : 'Nenhuma Nota ainda. Traga o histórico dela do Letterboxd, do Trakt, do IMDb ou do Simkl.',
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
    pedido: 'Faltou um campo, ou um valor não vale. Confira o formulário.',
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
    self: 'É você: o seu próprio acesso não sai por aqui.',
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
    cinematography: 'fotografia',
    producer: 'produtor',
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
