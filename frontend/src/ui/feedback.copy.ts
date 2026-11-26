import type { FeedbackRefusal } from '#/content/feedback-form'

export const FEEDBACK = {
  back: 'Voltar',
  unavailable:
    'Não deu para abrir a Sessão agora. Tente de novo daqui a pouco.',

  form: {
    title: 'Contar como foi',
    unknown: 'Não dá para contar como foi. A Sessão pode já estar fechada.',
    label: 'Contar como foi',
    film: 'O que vocês viram?',
    other: 'Outro filme',
    search: 'Título ou ID do IMDb',
    nothing: 'Não vimos nada',
    reactions: 'O que cada pessoa achou?',
    reactionsLead:
      'Use a Nota que a pessoa deu ou conte como ela reagiu. Sem uma reação, o filme fica registrado como Já visto.',
    reaction: 'Reação',
    none: 'sem reação',
    ratings: 'Nota',
    reports: 'Relato',
    rating: (value: string) => `Nota ${value}`,
    comment: 'Comentário',
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
  } satisfies Record<FeedbackRefusal, string>,
} as const
