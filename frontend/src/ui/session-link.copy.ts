// The Link da Sessão's words: the Dono's share button on the Session's
// page and the Presente's pages (#180, #275). The Presente has no login
// and may not know the app: no jargon on her side.

/** "Bruno" when the link knows who opened the Session, else "quem te
 * mandou o link". */
const who = (owner: string | null) => owner ?? 'quem te mandou o link'

export const PARTICIPATION = {
  share: 'Link para os Presentes',
  copy: 'Copiar link',
  copied: 'Link copiado',
  manual: 'Selecione o link abaixo para copiar.',
  /** The link's tab and its preview in a chat. */
  preview: (owner: string | null, names: readonly string[]) => ({
    title: owner
      ? `${owner} chamou você pra escolher o filme`
      : 'Escolha o filme da noite',
    description: `Escolha o filme com ${listed(names)}. Sem login: é só tocar no seu nome.`,
  }),
  invited: (owner: string | null, day: string) =>
    owner
      ? `${owner} chamou você pra escolher o filme · ${day}`
      : `Escolha o filme da noite · ${day}`,
  pick: 'Quem é você?',
  opened: 'abriu a Sessão',
  noLogin:
    'Sem login. Toque no seu nome pra votar nos filmes e, se quiser, responder umas perguntas de gosto.',
  unavailable: {
    broken: 'Esse link não abre',
    brokenLead:
      'O link pode ter vindo cortado ou ser de outra Sessão. Peça um novo pra quem te mandou.',
    closed: 'Essa Sessão já fechou',
    /** What the night ended with: the chosen film, when the Feedback
     * named one. */
    closedLead: (chosen: string | null) =>
      chosen
        ? `Vocês viram ${chosen}. A votação acabou; na próxima, peça o link novo pra quem te mandou.`
        : 'A Sessão terminou sem filme escolhido, e a votação acabou. Na próxima, peça o link novo pra quem te mandou.',
  },
  unknownPerson: 'Esse nome não está nesta Sessão. Toque no seu nome abaixo.',
  as: 'Você entrou como',
  notYou: 'Não é você?',
  films: 'Filmes da Sessão',
  lead: (n: number) =>
    n === 1
      ? 'O filme que o filmes separou pra noite.'
      : `Os ${n} que o filmes separou pra noite, na ordem em que ele recomenda.`,
  empty: 'A Sessão ainda não tem filmes.',
  vote: 'Votar nos filmes',
  voteNew: (n: number) =>
    n === 1 ? 'Votar no que chegou' : `Votar nos ${n} que chegaram`,
  revote: 'Você já votou · mudar votos',
  questionsTitle: 'Quer ajudar a acertar da próxima?',
  questionsLead: (owner: string | null) =>
    `Umas perguntas rápidas sobre filmes que você já viu. ${owner ?? 'Quem abriu a Sessão'} vê as respostas e decide se viram gosto.`,
  mine: (vote: 'yes' | 'no') => (vote === 'yes' ? 'você: sim' : 'você: não'),
  /** A film that came in after her Votos, on a list where she voted the
   * rest (pass 3 F2): text, not a sticker (#326). */
  arrived: 'chegou depois · você ainda não votou',
  left: 'Saiu da noite pelo seu não',
  who,
} as const

/** "Bruno, Iara e Quim". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
}
