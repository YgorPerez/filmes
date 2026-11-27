import { PARTICIPATION } from './session-link.copy'

// The group swipe's words on the Link da Sessão (#182, #275). The guest
// learns what a não does before the first card, not after.
const { who } = PARTICIPATION

const count = (n: number, one: string, many: string) =>
  n === 0 ? `nenhum ${one}` : `${n} ${n === 1 ? one : many}`

export const VOTES = {
  title: 'Sim ou não?',
  rule: 'Não tira o filme da noite pra todo mundo. Sim sobe ele na lista.',
  hint: 'Arraste o cartão pro lado, toque nos botões ou use as setas ← →.',
  of: (n: number, total: number) => `Filme ${n} de ${total}`,
  /** What a screen reader hears when the card changes. */
  now: (n: number, total: number, title: string) =>
    `Filme ${n} de ${total}: ${title}`,
  wentBack: (title: string) => `Voltou: ${title}`,
  no: 'Não',
  yes: 'Sim',
  stampNo: 'Não',
  stampYes: 'Sim',
  back: 'Voltar',
  summary: (yes: number, no: number) =>
    `${count(yes, 'sim', 'sins')} · ${count(no, 'não', 'nãos')}`,
  recap: 'Toque num voto pra mudar.',
  flip: (title: string, vote: 'yes' | 'no') =>
    `${title}: ${vote === 'yes' ? 'sim' : 'não'}. Tocar muda pra ${vote === 'yes' ? 'não' : 'sim'}.`,
  leaving: (titles: readonly string[]) =>
    `Vai sair da noite: ${titles.join(', ')}.`,
  send: 'Enviar votos',
  sending: 'Enviando votos…',
  restart: 'Recomeçar',
  sent: 'Votos enviados',
  voted: 'Você já votou',
  lineup: 'A lista da noite agora',
  revote: 'Mudar votos',
  list: 'Ver a lista',
  questions: 'Responder perguntas de gosto (1 min)',
  notices: {
    votado: 'Votos contados.',
    atualizada: 'Votos contados. A lista foi atualizada.',
    regerada:
      'Votos contados. Cada não tirou o filme, e outro entrou no lugar.',
  },
  refusals: {
    regerar: (owner: string | null) =>
      `Seus votos foram contados, mas a lista não foi refeita. Avise ${who(owner)}.`,
    indisponivel: () => 'Não deu pra enviar os votos agora. Tente de novo.',
    falha: (owner: string | null) =>
      `Deu um problema do nosso lado e seus votos não foram contados. Avise ${who(owner)}.`,
  },
} as const
