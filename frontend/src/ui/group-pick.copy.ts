// The Escolha de grupo's words (#415): the Presente's screen on the Link da
// Sessão, before the Perguntas par a par, and her line in the Dono's
// section on the Session's page.
export const GROUP_PICK = {
  title: 'Qual destes grupos tem mais a sua cara?',
  lead: (owner: string | null, max: number) =>
    `Escolha de 1 a ${max} grupos pelos filmes. ${owner ?? 'Quem abriu a Sessão'} vê a resposta e decide se vira gosto. Depois vêm as perguntas de um filme contra outro.`,
  legend: 'Grupos de filmes',
  picked: (n: number, max: number) =>
    n === 0 ? `Nenhum escolhido (até ${max})` : `${n} de ${max} escolhidos`,
  send: 'Pronto',
  none: 'Nenhum tem a minha cara',
  failed: (max: number) =>
    `Não deu para guardar. Escolha de 1 a ${max} grupos ou toque em “Nenhum tem a minha cara”.`,
  back: 'Voltar aos filmes',
  /** The Dono's section: the group and its films. */
  chose: (group: string, films: string) =>
    `Escolheu o grupo ${group}: ${films}`,
} as const
