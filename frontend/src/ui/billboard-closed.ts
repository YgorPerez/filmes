// What a closed Cartaz says where, apart from the components so each file
// exports only components or only code, as Fast Refresh needs.
import type { Billboard as BillboardModel } from '@filmes/engine'

/** Whether the closed Session's head says the chosen film's lines: it
 * does when a card shows the film (the block of one with no card says
 * them itself). Then the card and the legend do not repeat them (#351). */
export const linesOnTop = (billboard: BillboardModel): boolean =>
  !billboard.open && billboard.films.some((f) => (f.reactions?.length ?? 0) > 0)
