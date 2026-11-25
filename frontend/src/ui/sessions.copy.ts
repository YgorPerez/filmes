import type { ReplyRefusal, SessionNotice } from '#/content/billboard-reply'
import type { SessionRequestRefusal } from '#/content/session-request'

const films = (n: number) =>
  n === 0 ? 'nenhum filme' : n === 1 ? '1 filme' : `${n} filmes`

export const SESSIONS = {
  back: 'Voltar',
  unavailable:
    'As Sessões ainda não estão prontas neste servidor: falta o banco do filmes.',
  films,

  list: {
    title: 'Sessões',
    lead: 'Cada Sessão guarda os Presentes, o contexto e a Recomendação. Fica aberta até o Feedback.',
    create: 'Nova Sessão',
    open: 'Abertas',
    openEmpty: 'Nenhuma Sessão aberta.',
    closed: 'Fechadas',
    closedEmpty: 'Nenhuma Sessão fechada ainda.',
    feedback: 'Contar como foi',
    feedbackLabel: (id: string) => `Contar como foi a Sessão ${id}`,
    stub: (date: string, people: string, films: string) =>
      `${date} · ${people} · ${films}`,
    returnTitle: 'Falta contar como foi',
    returnText:
      'Diga o filme que viram e o que cada um achou. O Feedback fecha a Sessão.',
    chosen: (title: string) => `viram ${title}`,
    nothing: 'não viram nada',
  },

  session: {
    title: 'Sessão',
    unknown: 'Nenhuma Sessão com esse nome no repo de dados.',
    notices: {
      aberta: 'Sessão aberta. Depois do filme, dê o Feedback para fechá-la.',
      regerada:
        'Recomendação refeita: quem ficou segue no mesmo número, quem entrou tem o selo “novo”.',
      anotada:
        'Estrelas e comentários ficaram na Sessão. Eles não mexem no gosto de ninguém.',
    } satisfies Record<SessionNotice, string>,
    refusals: {
      nada: 'Nada marcado ainda.',
      texto:
        'A resposta não bate com o Cartaz desta Sessão. Recarregue a página e marque de novo.',
      fechada: 'Esta Sessão já tem Feedback: ela não recebe mais resposta.',
      regerar:
        'A resposta ficou gravada, mas não deu para refazer a Recomendação agora. Tente de novo daqui a pouco.',
      indisponivel:
        'Não deu para gravar a resposta agora. Tente de novo daqui a pouco.',
    } satisfies Record<ReplyRefusal, string>,
    warnings: 'Avisos',
    addition: (text: string) =>
      `Acrescentar: “${text}” ficou anotado na Sessão. Se for gosto de alguém, só vale com o seu sim:`,
    additionLink: 'diga na página da Pessoa.',
    closed: 'Fechada',
  },

  form: {
    title: 'Nova Sessão',
    lead: 'Quem vai assistir e o que vale hoje. A Recomendação sai com a Evidência de cada filme, e a Sessão fica aberta até o Feedback.',
    label: 'Nova Sessão',
    attendees: 'Presentes',
    attendeesLead: 'Quem vai assistir.',
    rule: 'Regra de escolha',
    rules: {
      padrao: 'Padrão: média sem miséria, com o Crédito de quem ficou atrás',
      media: 'Média dos Presentes',
      de: 'O gosto de uma Pessoa',
    },
    by: 'De quem',
    byHint: 'com “o gosto de uma Pessoa”',
    byNone: 'ninguém',
    moods: 'Clima',
    moodsLead: 'Puxa a ordem, nunca tira um filme.',
    count: 'Quantos filmes',
    countHint: 'em branco: o padrão',
    words: 'Em uma frase',
    wordsHint: 'opcional, fica na Sessão',
    wordsPlaceholder: 'eu e a Iara, algo leve',
    constraints: 'Restrições',
    constraintsLead:
      'Valem só nesta Sessão e tiram o filme antes de qualquer ordem. Deixe em branco o que não vale.',
    duration: 'Duração máxima',
    durationHint: 'em minutos',
    since: 'Lançado desde',
    until: 'Lançado até',
    yearHint: 'ano',
    language: 'Idioma original',
    languageHint: '“pt”, “português” ou o QID',
    child: 'Criança',
    childNone: 'sem criança',
    childNoAge: 'com criança (idade não informada: só livre)',
    childAge: (age: number) => (age === 1 ? '1 ano' : `${age} anos`),
    triggers: 'Gatilhos',
    triggersHint: 'temas do Does the Dog Die, separados por vírgula',
    similar: 'Parecido com',
    similarHint: 'IDs do IMDb (tt…), separados por vírgula',
    unseen: 'Nenhum Já visto',
    unseenHint: 'tira o filme que um Presente já viu',
    noSlow: 'Nada lento',
    noSad: 'Nada triste',
    seriesOrder: 'Série na ordem',
    seriesOrderLead:
      'A continuação de uma série de filmes só entra se todos os Presentes viram o filme antes dela. Franquia, como Marvel ou Star Wars, não conta.',
    seriesOrders: {
      anterior: 'Só se viram o anterior',
      todos: 'Só se viram todos os anteriores',
      'tanto-faz': 'Tanto faz',
    },
    seriesOrderDefault: 'padrão',
    submit: 'Recomendar',
    searchFold: 'Parecido com um filme?',
    searchFoldHint: 'ache o ID no Catálogo',
  },

  refusals: {
    presentes: 'Marque pelo menos um Presente.',
    de: '“O gosto de uma Pessoa” precisa de uma Pessoa entre os Presentes.',
    quantos: 'Quantos filmes: um número de 1 a 50.',
    duracao: 'Duração máxima: um número de minutos, 1 ou mais.',
    anos: 'Os anos são números de quatro dígitos, e “desde” não vem depois de “até”.',
    crianca: 'A idade da criança vai de 0 a 17.',
    parecido:
      '“Parecido com” leva IDs do IMDb (tt…) de filmes do Catálogo, separados por vírgula.',
    pessoa:
      'Uma das Pessoas marcadas não está mais no repo de dados. Recarregue a página.',
    pedido: 'Um valor do formulário não vale. Confira e peça de novo.',
    indisponivel: 'Não deu para recomendar agora. Tente de novo daqui a pouco.',
  } satisfies Record<SessionRequestRefusal, string>,
} as const
