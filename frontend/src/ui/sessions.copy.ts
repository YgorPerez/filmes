import { REQUEST_READING_MAX_LENGTH } from '@filmes/engine/reading-limits'
import type { ReplyRefusal, SessionNotice } from '#/content/billboard-reply'
import type { SessionRequestRefusal } from '#/content/session-request'

const quoted = (words: string) => `“${words}”`

/** "A", "A ou B", "A, B ou C". */
const either = (items: readonly string[]) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} ou ${items.at(-1)}`

/** The runs of words a reading did not understand: “a”, “b”. */
const runs = (words: readonly string[]) => words.map(quoted).join(', ')

/** A name or title a reading could not decide: “X” pode ser A ou B. */
const ambiguity = (words: string, candidates: readonly string[]) =>
  candidates.length === 0
    ? `${quoted(words)} não está no Catálogo`
    : `${quoted(words)} pode ser ${either(candidates)}`

const films = (n: number) =>
  n === 0 ? 'nenhum filme' : n === 1 ? '1 filme' : `${n} filmes`

/** A reading's item as a person says it (#272): "Presente: Iara" is
 * "Iara", and the logged-in Dono is "você"; "Clima: leve" is "leve". */
export const spoken = (label: string, owner?: string): string => {
  const person = /^Presente: (.+)$/.exec(label)?.[1]
  if (person !== undefined) return person === owner ? 'você' : person
  return label.replace(/^Clima: /, '')
}

export const SESSIONS = {
  back: 'Voltar',
  unavailable:
    'Não deu para abrir as Sessões: o site está com um problema, e ele ficou registrado no log do servidor.',
  films,

  list: {
    title: 'Sessões',
    create: 'Nova Sessão',
    filters: 'Filtrar Sessões',
    all: 'Todas',
    pending: 'Para contar',
    empty: 'Nenhuma Sessão ainda.',
    emptyLead:
      'Uma Sessão é uma noite de filme: você diz quem vai assistir, e a prateleira traz os filmes com o porquê de cada um.',
    emptyAction: 'Pedir filme',
    pendingEmpty: 'Nada para devolver.',
    pendingEmptyLead: 'Depois de ver um filme, conte aqui como foi.',
    feedback: 'Contar como foi',
    chosen: (title: string) => `Viram ${title}`,
    nothing: 'Não viram nada',
    /** The open Session's films by title, the first three (#272). */
    shelf: (titles: readonly string[], more: number) =>
      more > 0 ? `${titles.join(' · ')} e mais ${more}` : titles.join(' · '),
  },

  session: {
    title: 'Sessão de',
    unknown: 'Não encontrei essa Sessão.',
    unknownLead: 'O endereço pode estar errado, ou a Sessão é de outro Dono.',
    toList: 'Ver Sessões',
    toNew: 'Pedir filme',
    /** The ⋯ menu of the page's head (#272). */
    menu: 'Mais ações da Sessão',
    /** After the last film, while the Session is open. */
    seenIt: 'Já viram um filme?',
    notices: {
      aberta: 'Sessão aberta.',
      regerada:
        'Recomendação refeita. Os filmes que entraram têm o selo “novo”.',
      anotada:
        'Estrelas e comentários ficaram na Sessão. Eles não mexem no gosto de ninguém.',
      'perguntas-gravadas':
        'Respostas gravadas. O escolhido de cada par ganhou uma Nota fraca e o outro ficou como Já visto.',
      'perguntas-descartadas': 'Respostas descartadas.',
      contada: 'Feedback gravado e Sessão fechada.',
    } satisfies Record<SessionNotice, string>,
    refusals: {
      nada: 'Nada marcado ainda.',
      leitura:
        'Não entendi parte do acrescentar, e nada foi gravado. Corrija o texto ou envie assim mesmo.',
      texto:
        'A resposta não bate com o Cartaz desta Sessão. Recarregue a página e marque de novo.',
      fechada: 'Esta Sessão já está fechada.',
      regerar:
        'A resposta ficou gravada, mas não deu para refazer a Recomendação agora. Tente de novo daqui a pouco.',
      indisponivel:
        'Não deu para gravar a resposta agora. Tente de novo daqui a pouco.',
      falha:
        'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
    } satisfies Record<ReplyRefusal, string>,
    warnings: 'Avisos',
    addition: (text: string) =>
      `Anotei “${text}” nesta Sessão. Para guardar um gosto,`,
    additionLink: 'vá à página da Pessoa.',
    /** The acrescentar as the Leitura do pedido read it (#200). */
    additionRead: (text: string) => `Você acrescentou “${text}”.`,
    additionAdded: (labels: readonly string[]) =>
      `Acrescentei ao pedido ${labels.join(', ')}.`,
    additionNotUnderstood: (words: readonly string[]) =>
      `Deixei ${runs(words)} só como anotação.`,
    additionAmbiguous: (words: string, candidates: readonly string[]) =>
      candidates.length === 0
        ? `${ambiguity(words, candidates)}.`
        : `${ambiguity(words, candidates)}. Diga qual na próxima vez.`,
    additionTaste: 'Para guardar um gosto,',
    /** The reading as a sentence (#272): "Entendi: Iara, leve, até 2h." */
    understood: (items: readonly string[]) => `Entendi: ${items.join(', ')}.`,
    closed: 'Fechada',
    /** A told Session opens with the tape given back (#272). */
    returned: 'Fita devolvida',
    returnedNothing: 'Não viram nada da prateleira.',
    satisfaction:
      'Na próxima Sessão deste grupo, na Regra padrão, quem gostou menos pesa mais:',
    again: 'Pedir filme de novo com essa turma',
    others: (n: number) =>
      n === 1 ? 'O outro filme da prateleira' : `Os outros ${n} da prateleira`,
    shelf: 'A prateleira da noite',
  },

  form: {
    title: 'Nova Sessão',
    label: 'Nova Sessão',
    attendees: 'Quem vai assistir?',
    rule: 'Regra de escolha',
    rules: {
      padrao: 'Padrão, favorece quem gostou menos nas últimas Sessões',
      media: 'Média dos Presentes',
      de: 'O gosto de uma Pessoa',
    },
    by: 'De quem',
    byHint: 'se a Regra for pelo gosto de uma Pessoa',
    byNone: 'ninguém',
    moods: 'Clima',
    moodsLead: 'Puxa a ordem, nunca tira um filme.',
    count: 'Quantos filmes',
    countHint: 'deixe em branco para usar o padrão',
    words: 'Em uma frase',
    wordsHint: 'opcional. Toque em Ler para preencher o pedido.',
    wordsPlaceholder: 'eu e a Iara, algo leve, até 2h',
    read: 'Ler',
    /** "vocês dois", "vocês três": the bar's who (#272). */
    together: (n: number) =>
      `vocês ${['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis'][n] ?? n}`,
    reading: {
      understood: (labels: readonly string[]) =>
        `Entendi: ${labels.join(', ')}.`,
      /** A title the Catálogo does not have, and the search for it. */
      missing: (words: string) => `Não achei ${quoted(words)} no Catálogo.`,
      missingSearch: 'Buscar em “Parecido com um filme?”',
      nothing: 'Não consegui preencher o pedido pela frase.',
      notUnderstood: (words: readonly string[]) =>
        `Deixei ${runs(words)} de fora.`,
      ambiguous: (
        items: readonly { words: string; candidates: readonly string[] }[],
      ) =>
        `Confira no formulário. ${items
          .map(({ words, candidates }) => ambiguity(words, candidates))
          .join('. ')}.`,
      /** A title of several films: each with “Usar”, as the search. */
      similarAmbiguous: (words: string) =>
        `Qual destes filmes você quis dizer com ${quoted(words)}?`,
      busy: 'Lendo…',
    },
    constraints: 'Restrições',
    constraintsLead: 'Marque só os limites desta noite.',
    /** The duration out of the fold (#272), under its own question. */
    time: 'Quanto tempo vocês têm?',
    duration: 'Duração máxima',
    durationHint: 'em minutos',
    since: 'Lançado desde',
    until: 'Lançado até',
    yearHint: 'ano',
    language: 'Idioma original',
    languageHint: 'ex.: português',
    child: 'Criança',
    childNone: 'sem criança',
    childNoAge: 'com criança, só filmes livres',
    childAge: (age: number) => (age === 1 ? '1 ano' : `${age} anos`),
    triggers: 'Gatilhos',
    triggersHint: 'separe os temas por vírgula',
    similar: 'Parecido com',
    similarHint: 'IDs do IMDb (tt…), separados por vírgula',
    similarNone: 'Nenhum filme ainda. Busque acima e toque em Usar.',
    unseen: 'Só filmes que ninguém viu',
    noSlow: 'Nada lento',
    noSad: 'Nada triste',
    seriesOrder: 'Série na ordem',
    seriesOrderLead:
      'Na opção padrão, a continuação só entra se todo mundo viu o filme anterior. Vale para séries de filmes, não para franquias como Marvel ou Star Wars.',
    seriesOrders: {
      anterior: 'Só se viram o anterior',
      todos: 'Só se viram todos os anteriores',
      'tanto-faz': 'Tanto faz',
    },
    seriesOrderDefault: 'padrão',
    submit: 'Recomendar',
    submitting: 'Abrindo…',
    searchFold: 'Parecido com um filme?',
    searchLabel: 'Buscar pelo título ou ID do IMDb',
    details: 'Mais opções',
  },

  refusals: {
    frase: 'Escreva a frase antes de tocar em “Ler”.',
    'frase-longa': `A frase passa de ${REQUEST_READING_MAX_LENGTH} caracteres. Encurte e toque em “Ler” de novo.`,
    presentes: 'Marque pelo menos um Presente.',
    de: '“O gosto de uma Pessoa” precisa de uma Pessoa entre os Presentes.',
    quantos: 'Escolha de 1 a 50 filmes.',
    duracao: 'A duração máxima precisa ser de pelo menos um minuto.',
    anos: 'Use anos de quatro dígitos, do mais antigo para o mais recente.',
    crianca: 'A idade da criança vai de 0 a 17.',
    parecido:
      '“Parecido com” leva IDs do IMDb (tt…) de filmes do Catálogo, separados por vírgula.',
    pessoa:
      'Alguém da lista saiu do cadastro. Recarregue a página e marque quem vai assistir.',
    pedido: 'Um valor do formulário não vale. Confira e peça de novo.',
    indisponivel: 'Não deu para recomendar agora. Tente de novo daqui a pouco.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  } satisfies Record<SessionRequestRefusal, string>,
} as const
