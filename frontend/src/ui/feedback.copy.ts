import type { FeedbackRefusal } from '#/content/feedback-form'

export const FEEDBACK = {
  back: 'Voltar',
  unavailable:
    'Não deu para abrir a Sessão: o site está com um problema, e ele ficou registrado no log do servidor.',

  form: {
    title: 'Contar como foi',
    unknown: 'Não encontrei essa Sessão.',
    unknownLead: 'O endereço pode estar errado, ou a Sessão é de outro Dono.',
    /** The Session was told already (#272): what they saw, and the way to
     * it. */
    told: (title: string | null) =>
      title === null
        ? 'Esta Sessão já foi contada: não viram nada da prateleira.'
        : `Esta Sessão já foi contada: viram ${title}.`,
    toSession: 'Ver a Sessão',
    /** A Dono who was there corrects a told Session (#344). */
    correct: 'Corrigir o que contei',
    correctTitle: 'Corrigir o que contei',
    correctLead:
      'O formulário vem com o que foi contado. Gravar troca o que estava gravado; no Trakt, vai só o que mudou.',
    correctSubmit: 'Gravar a correção',
    toList: 'Ver Sessões',
    label: 'Contar como foi',
    /** Said to one when the Session had one Presente (#272). */
    film: (alone: boolean) =>
      alone ? 'O que você viu?' : 'O que vocês viram?',
    other: 'Outro filme',
    /** The films that left the shelf in a redo (#272). */
    earlier: 'Também passaram pela prateleira',
    /** The stars the Cartaz gave a film. */
    stars: (n: number) => `${n} de 5 ★`,
    search: 'Título ou ID do IMDb',
    nothing: (alone: boolean) => (alone ? 'Não vi nada' : 'Não vimos nada'),
    reactions: (alone: boolean) =>
      alone ? 'O que você achou?' : 'O que cada um achou?',
    reactionsLead:
      'A nota é a mesma de 1 a 10 do Cartaz. Para os outros, basta dizer se gostou. Sem reação, o filme fica só como Já visto.',
    reaction: 'Reação',
    none: 'sem reação',
    noRating: 'sem nota',
    ratings: 'Nota',
    ratingLabel: (name: string) => `Nota de ${name}, de 1 a 10`,
    reports: 'Relato',
    rating: (value: string) => `Nota ${value}`,
    comment: 'Comentário',
    openComment: 'comentar',
    submit: 'Gravar e fechar a Sessão',
    submitting: 'Gravando…',
  },

  satisfaction: {
    title: 'Satisfação',
    lead: 'Na regra padrão, quem gostou menos dos últimos filmes ganha mais peso na próxima Sessão do grupo.',
    empty: 'Ninguém deste grupo está atrás dos outros agora.',
  },

  refusals: {
    filme: 'Escolha o filme que vocês viram, outro filme ou “não vimos nada”.',
    comentario:
      'O comentário vai junto da Nota ou do Relato. Dê uma reação a quem comentou.',
    nada: 'Tire as Notas e os Relatos para gravar “Não vimos nada”.',
    desconhecido:
      'Nenhum filme do Catálogo tem esse título. Confira o nome ou use o ID do IMDb (tt…).',
    ambiguo:
      'Mais de um filme tem esse título. Ponha o ano entre parênteses ou use o ID do IMDb (tt…).',
    pedido: 'Um valor do formulário não vale. Confira e grave de novo.',
    fechada: 'Essa Sessão já está fechada.',
    indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  } satisfies Record<FeedbackRefusal, string>,
} as const
