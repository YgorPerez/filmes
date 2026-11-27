import { PARTICIPATION } from './session-link.copy'

// The group swipe's words on the Link da Sessão (#182, #275). The guest
// learns what a não does before the first card, not after.
const { who } = PARTICIPATION

const count = (n: number, one: string, many: string) =>
  n === 0 ? `nenhum ${one}` : `${n} ${n === 1 ? one : many}`

export const VOTES = {
  title: 'Sim ou não?',
  /** The recap's title: every card is answered, she is reviewing. */
  review: 'Revise seus votos',
  /** The veto rule, with Não and Sim marked as the buttons they name
   * (pass 3 F1): read alone, "Não tira o filme" read as a negation. */
  rule: {
    no: 'Não',
    noDoes: 'tira o filme da noite pra todo mundo.',
    yes: 'Sim',
    yesDoes: 'sobe ele na lista.',
  },
  /** The rule as one sentence, for tests and the screen reader. */
  ruleText: 'Não tira o filme da noite pra todo mundo. Sim sobe ele na lista.',
  /** How to vote: the arrow keys only where there is a keyboard. */
  hint: {
    touch: 'Arraste o cartão pro lado ou toque nos botões.',
    keys: 'Arraste o cartão pro lado, toque nos botões ou use as setas ← →.',
  },
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
  recap: 'Revise antes de enviar: dá pra mudar qualquer voto aqui.',
  /** Mudar votos: the recap opens on her earlier Votos (#340). */
  kept: 'Seus votos de antes estão marcados e valem até você enviar os novos. Mude o que quiser aqui.',
  /** What a screen reader hears after the last card. */
  end: (yes: number, no: number) =>
    `Fim: ${count(yes, 'sim', 'sins')}, ${count(no, 'não', 'nãos')}. Revise e envie.`,
  /** The name of a recap row's Não / Sim pair. */
  voteOn: (title: string) => `Voto em ${title}`,
  leaving: (titles: readonly string[]) =>
    `Vai sair da noite: ${titles.join(', ')}.`,
  send: 'Enviar votos',
  sending: 'Enviando votos…',
  restart: 'Recomeçar',
  sent: 'Votos enviados',
  voted: 'Você já votou',
  /** The title over a failure she cannot fix. */
  stuck: {
    falha: 'Seus votos não foram contados',
    regerar: 'Votos contados',
  },
  lineup: 'A lista da noite agora',
  revote: 'Mudar votos',
  list: 'Ver a lista',
  /** Short enough to stay on one line of the pill at 390px, with "1 min"
   * kept whole (pass 4 F5). */
  questions: 'Responder perguntas (1\u00a0min)',
  /** Her sim on films another Presente's não had already taken out, on an
   * older deck: the engine skipped them (pass 4 F3). */
  stale: (titles: readonly string[]) =>
    `Já tinha saído da noite antes do seu sim: ${titles.join(', ')}.`,
  notices: {
    votado: 'Votos contados.',
    atualizada: 'Votos contados. A lista foi atualizada.',
    /** The line under the list names what her não took out (pass 5 F3). */
    regerada: 'Votos contados. A lista foi refeita.',
  },
  refusals: {
    regerar: (owner: string | null) =>
      `Seus votos foram contados, mas a lista não foi refeita. Fale com ${who(owner)}.`,
    indisponivel: () => 'Não deu pra enviar os votos agora. Tente de novo.',
    falha: (owner: string | null) =>
      `Deu um problema do nosso lado. Fale com ${who(owner)}.`,
  },
} as const
