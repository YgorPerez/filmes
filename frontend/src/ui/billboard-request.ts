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

const IN_WORDS = [
  '',
  '',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
]

/** The shelf label of a Session outside the Cartaz (Contar), the same as
 * the Cartaz's (#272): who, as the engine's `requestWho` says it ("Você",
 * "Iara", "Vocês quatro"), the duration, the Climas, the other
 * Restrições. `constraints` are the Session's labels, the duration
 * first. */
export const sessionLabel = (s: {
  attendees: readonly { name: string; owner: boolean }[]
  moods: readonly string[]
  constraints: readonly string[]
}): string[] => {
  const [only] = s.attendees
  const who =
    s.attendees.length === 1 && only
      ? only.owner
        ? 'Você'
        : only.name
      : `Vocês ${IN_WORDS[s.attendees.length] ?? s.attendees.length}`
  return [
    who,
    ...s.constraints.filter(isDuration),
    ...s.moods,
    ...s.constraints.filter((c) => !isDuration(c)),
  ]
}
