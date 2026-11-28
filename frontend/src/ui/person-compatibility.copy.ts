// The words of the Compatibilidade on the Pessoa page (#403): how close
// each other Pessoa rates the films both rated, and the films where they
// agree and diverge most, each Nota on the 1 to 10 of the Já vi.

export const COMPATIBILITY = {
  title: 'Compatibilidade',
  lead: (name: string) =>
    `O quanto ${name} concorda com cada Pessoa nos filmes a que as duas deram nota, cada nota lida na escala de quem a deu.`,
  /** No Pessoa shares the minimum of films with her. */
  none: (name: string, minShared: number) =>
    `Ainda ninguém deu nota a ${minShared} filmes que ${name} também avaliou: a compatibilidade aparece a partir daí.`,
  /** The agreement, 0 to 1, as a whole percentage. */
  agreement: (value: number) => `${Math.round(value * 100)}% de acordo`,
  shared: (n: number) =>
    n === 1 ? '1 filme em comum' : `${n} filmes em comum`,
  agree: 'Concordam em',
  diverge: 'Discordam em',
  film: (title: string, year: number | null) =>
    year === null ? title : `${title} (${year})`,
  /** Each one's Nota, 1 to 10: "Bruno 9 · Quim 10". */
  ratings: (name: string, mine: number, other: string, theirs: number) =>
    `${name} ${mine} · ${other} ${theirs}`,
} as const
