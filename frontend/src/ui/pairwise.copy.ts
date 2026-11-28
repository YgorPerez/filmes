// The Perguntas par a par's words (#181, #275): the Presente's page on the
// Link da Sessão and the Dono's section on the Session's page.
export const PAIRWISE = {
  invite: 'Responder perguntas de gosto',
  title: 'Qual dos dois você gostou mais?',
  lead: (owner: string | null) =>
    `Toque no filme que você gostou mais, se viu os dois. ${owner ?? 'Quem abriu a Sessão'} vê as respostas e decide se viram gosto.`,
  progress: (n: number, total: number) => `Pergunta ${n} de ${total}`,
  canStop: 'Pode parar quando quiser.',
  skip: 'Não vi algum dos dois',
  failed: 'Não deu para guardar essa resposta. Responda a pergunta abaixo.',
  doneTitle: 'Obrigado!',
  done: (owner: string | null) =>
    `${owner ?? 'Quem abriu a Sessão'} vê suas respostas e decide se viram gosto.`,
  noneTitle: 'Nenhuma pergunta agora',
  none: 'Não há perguntas para você agora.',
  unavailable: 'As perguntas estão indisponíveis agora.',
  back: 'Voltar aos filmes',
  film: (title: string, year: number | null) =>
    year === null ? title : `${title} (${year})`,
  owner: {
    title: 'Respostas pelo link',
    lead: 'O que os Presentes responderam pelo link. Gravar faz o escolhido de cada par virar Nota fraca da Pessoa, e o outro, Já visto; cada "vi e gostei" ou "vi e não gostei" vira Já visto e o que ela achou.',
    prefers: (chosen: string, other: string) => `Preferiu ${chosen} a ${other}`,
    saw: (film: string, liked: boolean) =>
      liked ? `Viu e gostou de ${film}` : `Viu e não gostou de ${film}`,
    record: (name: string) => `Gravar as respostas de ${name}`,
    discard: 'Descartar',
    sending: 'Enviando decisão…',
  },
} as const
