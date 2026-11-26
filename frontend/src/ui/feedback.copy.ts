import type { FeedbackRefusal } from '#/content/feedback-form'

const films = (n: number) =>
  n === 0 ? 'nenhum filme' : n === 1 ? '1 filme' : `${n} filmes`

export const FEEDBACK = {
  back: 'Voltar',
  unavailable:
    'As Sessões ainda não estão prontas neste servidor: falta o banco do filmes.',

  list: {
    title: 'Feedback',
    lead: 'As Sessões abertas esperam o Feedback: o filme que vocês viram e o que cada Presente achou. Gravar fecha a Sessão.',
    empty: 'Nenhuma Sessão aberta.',
    films,
    recorded: (id: string) =>
      `Feedback gravado: a Sessão ${id} fechou. A satisfação da próxima Sessão já conta com ele.`,
    gone: 'Essa Sessão não está mais no repo de dados.',
  },

  form: {
    title: 'Feedback da Sessão',
    unknown:
      'Nenhuma Sessão aberta com esse nome: ela já tem Feedback ou não existe.',
    label: 'Feedback da Sessão',
    film: 'O que vocês viram?',
    other: 'Outro filme',
    search: 'Título ou ID do IMDb',
    searchHint: 'um filme fora da lista: “Título (ano)” ou tt…',
    nothing: 'Não vimos nada',
    nothingHint: 'fecha a Sessão sem reações',
    reactions: 'O que cada Presente achou',
    reactionsLead:
      'A Nota é a de quem viu; para outra Pessoa, o Dono pode dar a Nota que ela disse ou um Relato do que viu nela. Quem fica sem reação ganha só o Já visto.',
    reaction: 'Reação',
    none: 'sem reação',
    ratings: 'Nota',
    reports: 'Relato do Dono',
    rating: (value: string) => `Nota ${value}`,
    comment: 'Comentário',
    commentHint: 'opcional: o que ela achou, junto da Nota ou do Relato',
    submit: 'Gravar e fechar a Sessão',
    searchFold: 'Viram outro filme?',
    searchFoldHint: 'ache o título ou o ID no Catálogo',
  },

  satisfaction: {
    title: 'Satisfação',
    lead: 'Quem saiu das Sessões recentes menos satisfeito que os outros Presentes. Na Regra padrão, os filmes dessa Pessoa sobem na próxima Recomendação deste grupo.',
    empty: 'Ninguém deste grupo está atrás dos outros agora.',
    value: (value: number) => `Satisfação ${Math.round(value * 100)}%`,
  },

  refusals: {
    filme: 'Escolha o filme que vocês viram, outro filme ou “não vimos nada”.',
    comentario:
      'O comentário vai junto da Nota ou do Relato: dê uma reação a quem comentou.',
    nada: '“Não vimos nada” não leva reação: tire as Notas e os Relatos.',
    desconhecido:
      'Nenhum filme do Catálogo tem esse título. Confira o nome ou use o ID do IMDb (tt…).',
    ambiguo:
      'Mais de um filme tem esse título. Ponha o ano entre parênteses ou use o ID do IMDb (tt…).',
    pedido: 'Um valor do formulário não vale. Confira e grave de novo.',
    fechada: 'Essa Sessão já tem Feedback: nada mudou.',
    indisponivel: 'Não deu para gravar agora. Tente de novo daqui a pouco.',
  } satisfies Record<FeedbackRefusal, string>,
} as const
