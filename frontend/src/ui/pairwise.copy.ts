// The Perguntas par a par's words (#181): the Presente's page on the Link da
// Sessão and the Dono's section on the Session's page.
export const PAIRWISE = {
  invite: 'Responder perguntas de gosto',
  title: 'Qual dos dois você gostou mais?',
  lead: 'Escolha só se viu os dois. As respostas só viram gosto depois que o Dono da Sessão aprovar.',
  progress: (n: number, total: number) => `Pergunta ${n} de ${total}`,
  skip: 'Não vi os dois',
  failed: 'Não deu para guardar essa resposta. Responda a pergunta abaixo.',
  done: 'Pronto, obrigado! As respostas ficaram com o Dono da Sessão.',
  none: 'Não há perguntas para você agora.',
  unavailable: 'As perguntas estão indisponíveis agora.',
  back: 'Voltar aos filmes da Sessão',
  film: (title: string, year: number | null) =>
    year === null ? title : `${title} (${year})`,
  owner: {
    title: 'Perguntas par a par',
    lead: 'O que os Presentes responderam pelo link. Gravar faz o escolhido de cada par virar Nota fraca da Pessoa, e o outro, Já visto.',
    prefers: (chosen: string, other: string) => `Preferiu ${chosen} a ${other}`,
    record: (name: string) => `Gravar as respostas de ${name}`,
    discard: 'Descartar',
    sending: 'Enviando decisão…',
  },
} as const
