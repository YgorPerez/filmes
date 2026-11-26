// The group swipe's words on the Link da Sessão (#182).
export const VOTES = {
  open: 'Votar nos filmes',
  title: 'Sim ou não?',
  hint: 'Arraste o cartão para a direita (sim) ou para a esquerda (não), ou toque nos botões.',
  of: (n: number, total: number) => `Filme ${n} de ${total}`,
  no: 'Não',
  yes: 'Sim',
  back: 'Voltar',
  summary: (yes: number, no: number) =>
    `${yes} ${yes === 1 ? 'sim' : 'sins'} · ${no} ${no === 1 ? 'não' : 'nãos'}`,
  rule: 'Um não tira o filme da Sessão e outro entra no lugar. Um sim sobe o filme na lista.',
  send: 'Enviar votos',
  sending: 'Enviando votos…',
  restart: 'Recomeçar',
  done: 'Você já votou em todos os filmes da tela.',
  refresh: 'Ver se chegou filme novo',
  list: 'Ver a lista',
  notices: {
    votado: 'Votos contados.',
    atualizada: 'Votos contados. A lista foi atualizada.',
    regerada:
      'Votos enviados. Cada não tirou o filme, e outro entrou no lugar.',
  },
  refusals: {
    regerar:
      'Os votos foram gravados, mas a lista não pôde ser refeita. Avise quem abriu a Sessão.',
    indisponivel: 'Não deu para gravar os votos agora. Tente de novo.',
    falha:
      'O site está com um problema, e ele ficou registrado no log do servidor. Tentar de novo não resolve.',
  },
} as const
