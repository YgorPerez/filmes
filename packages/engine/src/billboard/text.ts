// The text the Cartaz's Copiar pro chat (or Enviar) builds from the Dono's
// marks (`cartaz.js` `textoDoCartaz`). `answerBillboard` reads it back.
//
// Pure and free of Node: the React Cartaz (#114) and the MCP Apps view
// (#111) import it from `@filmes/engine/billboard-text`.
//
//     #cartaz 2026-11-20-iara v2
//     acrescentar: chegou a Ana, algo leve
//     1 tt9000104 · já vi: bruno=8 · estrelas: 4
//     3 tt9000106 · já vi: todos
//     4 tt9000107 · já vi: bruno, teo · trocar · comentário: lindo, mas · longo
//     5 tt9000108 · estrelas: 2
//
// - The header is always the first line: `#cartaz <session id> v<n>`, with
//   `n` the version the Cartaz shows.
// - `acrescentar: <text>` comes second, only when the field has text.
// - `clima: <name>, <name>` comes next, only when the Dono changed the
//   Climas on the Cartaz: the ones she chose, in the vocabulary's order;
//   `clima: nenhum` when she took them all off.
// - One line per marked film, in screen order: `<position> <IMDb id>`, then
//   the marks joined by ` · `, always in this order:
//   - `já vi: <slug>, <slug>=<nota>, ...`: each marked Pessoa, with
//     `=<nota>` (1 to 10, the Feedback's scale) when hers was filled in, in
//     the Presentes' order. `já vi: todos` when every Presente (more than
//     one) is marked and nobody gave a Nota or said what she thought.
//   - `achou <slug>: <text>`, one per marked Pessoa who said what she
//     thought, in the Presentes' order. A ` · ` inside it becomes ` - `.
//   - `trocar`
//   - `estrelas: <1 to 5>`
//   - `comentário: <text>`, always last: it runs to the end of the line and
//     may hold ` · `.
// - Free text (acrescentar, comentário, achou) becomes one line: runs of
//   whitespace become one space, none at the ends.
// - The text ends with a line break. With no mark, it is only the header.

/** What the Dono marked on one film of the Cartaz. */
export interface BillboardMarks {
  /** Its position on the screen. */
  readonly position: number
  readonly id: string
  /** The Presentes (slugs) who marked Já vi. */
  readonly seen: ReadonlyArray<string>
  /** Each one's Nota, 1 to 10; a value outside that is left out. */
  readonly ratings?: Readonly<Record<string, number>>
  /** What each one thought of it. */
  readonly thoughts?: Readonly<Record<string, string>>
  readonly swap: boolean
  /** 1 to 5; 0 is none. */
  readonly stars: number
  readonly comment: string
}

/** The Cartaz's marks, as the page holds them. */
export interface BillboardState {
  readonly session: string
  /** The version the Cartaz shows. */
  readonly version: number
  /** The Presentes' slugs, in order. */
  readonly attendees: ReadonlyArray<string>
  readonly addition: string
  /** The Climas the Dono chose, when she changed them; absent or null
   * when she left the version's. */
  readonly moods?: ReadonlyArray<string> | null
  readonly films: ReadonlyArray<BillboardMarks>
}

/** The Clima line's value when the Dono took every Clima off. */
export const NO_MOOD = 'nenhum'

const oneLine = (text: string | undefined): string =>
  (text ?? '').replace(/\s+/g, ' ').trim()

/** The text to paste in the chat, or to send (`textoDoCartaz`). */
export const billboardText = (state: BillboardState): string => {
  const lines = [`#cartaz ${state.session} v${state.version}`]
  const addition = oneLine(state.addition)
  if (addition) lines.push(`acrescentar: ${addition}`)
  if (state.moods)
    lines.push(
      `clima: ${state.moods.length > 0 ? state.moods.map(oneLine).join(', ') : NO_MOOD}`,
    )
  for (const film of state.films) {
    const parts: string[] = []
    const seen = state.attendees.filter((p) => film.seen.includes(p))
    const ratings = film.ratings ?? {}
    const thoughts = film.thoughts ?? {}
    // " · " joins the marks: inside what a Pessoa thought it becomes " - ".
    const thought = (p: string) =>
      oneLine((thoughts[p] ?? '').replace(/\s*·\s*/g, ' - '))
        .replace(/^- | -$/g, '')
        .trim()
    const detailed = seen.some((p) => ratings[p] || thought(p))
    if (seen.length > 1 && seen.length === state.attendees.length && !detailed)
      parts.push('já vi: todos')
    else if (seen.length > 0)
      parts.push(
        `já vi: ${seen.map((p) => (ratings[p] ? `${p}=${ratings[p]}` : p)).join(', ')}`,
      )
    for (const p of seen)
      if (thought(p)) parts.push(`achou ${p}: ${thought(p)}`)
    if (film.swap) parts.push('trocar')
    if (film.stars) parts.push(`estrelas: ${film.stars}`)
    const comment = oneLine(film.comment)
    if (comment) parts.push(`comentário: ${comment}`)
    if (parts.length > 0)
      lines.push([`${film.position} ${film.id}`, ...parts].join(' · '))
  }
  return `${lines.join('\n')}\n`
}
