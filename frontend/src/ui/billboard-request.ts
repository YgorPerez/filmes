// The request on the Cartaz's shelf label: what the Dono asked for. The
// engine's reading (`request.parts`) also carries the minimum IMDb rating,
// which holds for every Recomendação (AGENTS.md, Nota mínima): it is no
// limit of this night, so the label and the empty Cartaz leave it out
// (#277).

const FIXED = /^nota \d+(?:,\d+)?\+ no IMDb$/u

/** The parts of the request the Dono asked for, in order. */
export const askedParts = (parts: readonly string[]) =>
  parts.filter((part) => !FIXED.test(part))

/** The duration limit ("até 20min"), when the request has one. */
export const isDuration = (part: string) => part.startsWith('até ')
