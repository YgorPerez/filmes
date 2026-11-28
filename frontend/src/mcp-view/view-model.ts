// What the MCP Apps view reads from the host and writes back, as pure
// functions: the Cartaz out of the `billboard` tool's result, and what
// Claude gets after Enviar recorded the reply (`answer_billboard`): a
// message in the Dono's own words, which the chat shows as hers, and the
// detail he needs to redo the list (the ids, the Climas), which goes in
// his context instead (#277).

import type { Billboard, BillboardPerson, BillboardReply } from '@filmes/engine'

/** The part of an MCP `CallToolResult` the view reads. */
export type ToolResult = {
  readonly isError?: boolean
  readonly content?: ReadonlyArray<{ readonly type: string; text?: string }>
}

/** The JSON of a tool result's text block, or null. */
function jsonOf(result: ToolResult): unknown {
  const text = result.content?.find((block) => block.type === 'text')?.text
  try {
    return JSON.parse(text ?? 'null')
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

/** The engine's error code of a failed result, or null. */
export function errorCodeOf(result: ToolResult): string | null {
  const json = jsonOf(result)
  return isRecord(json) &&
    isRecord(json.error) &&
    typeof json.error.code === 'string'
    ? json.error.code
    : null
}

/** The Cartaz a `billboard` result carries, with the Link da Sessão when
 * the Dono has it (#396); the error's code otherwise (null when it has
 * none). The view never shows the engine's words. */
export function billboardOf(
  result: ToolResult,
):
  | { billboard: Billboard; sessionLink: string | null }
  | { error: string | null } {
  const json = jsonOf(result)
  if (!result.isError && isRecord(json) && isRecord(json.billboard))
    return {
      billboard: json.billboard as unknown as Billboard,
      sessionLink:
        typeof json.sessionLink === 'string' ? json.sessionLink : null,
    }
  return { error: errorCodeOf(result) }
}

/** The answer of `answer_billboard`, when the call worked. */
export function replyOf(result: ToolResult): BillboardReply | null {
  const json = jsonOf(result)
  return !result.isError && isRecord(json) && 'regenerate' in json
    ? (json as unknown as BillboardReply)
    : null
}

/** One line of free text: what the host takes in a `ui/message` (no line
 * breaks of its own, no invisible characters). */
const line = (text: string) =>
  text
    .replaceAll(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()

/** The host's limit for a `ui/message`. */
const MESSAGE_LIMIT = 8000

/** "a", "a e b", "a, b e c". */
const andList = (items: readonly string[]) =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`

/** A Nota of 0,5 to 5 on the Cartaz's scale of 1 to 10: "8". */
const tenScale = (rating: number) => String(rating * 2).replace('.', ',')

type SentReply = Pick<
  BillboardReply,
  | 'session'
  | 'version'
  | 'regenerate'
  | 'keep'
  | 'moods'
  | 'addition'
  | 'comments'
  | 'dropped'
  | 'seen'
>

/** Who saw a film, and the Notas they gave, each with who gave it. */
type Seen = {
  people: string[]
  ratings: { name: string; owner: boolean; rating: string }[]
}

/** Who saw each film, by title, in the order the reply lists them. */
function seenByTitle(
  seen: SentReply['seen'],
  people: readonly BillboardPerson[],
) {
  const bySlug = new Map(people.map((p) => [p.slug, p]))
  const byTitle = new Map<string, Seen>()
  for (const s of seen) {
    const person = bySlug.get(s.person)
    const name = person?.name ?? s.person
    const owner = person?.owner ?? false
    const entry = byTitle.get(s.title) ?? { people: [], ratings: [] }
    entry.people.push(owner ? 'eu' : name)
    if (s.rating !== null)
      entry.ratings.push({ name, owner, rating: tenScale(s.rating) })
    byTitle.set(s.title, entry)
  }
  return byTitle
}

/** The Notas in brackets: "nota 8" when one Presente saw it (the sentence
 * named her already, #277); with more, whose each one is ("nota 8, Iara
 * deu 6"). */
function ratingsText({ people: who, ratings }: Seen) {
  if (ratings.length === 0) return ''
  const one = who.length === 1
  const said = ratings.map((r) =>
    one || r.owner ? `nota ${r.rating}` : `${r.name} deu ${r.rating}`,
  )
  return ` (${said.join(', ')})`
}

/** "já vimos", "já viram", "Já vi" or "já viu", by who saw it. */
function seenVerb(names: readonly string[]) {
  const owner = names[0] === 'eu'
  if (names.length > 1) return owner ? 'já vimos' : 'já viram'
  return owner ? 'Já vi' : 'já viu'
}

/** "Eu e Iara já vimos Fronteira (Iara deu 8).", "Iara já viu Fronteira
 * (nota 8)." */
function seenSentence(title: string, seen: Seen) {
  // The Dono first ("Eu e Iara já vimos").
  const names = seen.people.toSorted(
    (a, b) => Number(b === 'eu') - Number(a === 'eu'),
  )
  const subject =
    names.length === 1 && names[0] === 'eu'
      ? ''
      : `${andList(names).replace(/^eu/u, 'Eu')} `
  return `${subject}${seenVerb(names)} ${line(title)}${ratingsText(seen)}.`
}

/** "Quero o clima leve.", "Tirei o clima." or nothing. */
function moodSentence(moods: SentReply['moods']) {
  if (moods === null) return false
  return moods.length > 0
    ? `Quero o clima ${andList(moods)}.`
    : 'Tirei o clima.'
}

/** "Refaz a lista?" or "Refaz a lista mantendo o resto?", when it redoes. */
function redoSentence(reply: SentReply) {
  if (!reply.regenerate) return false
  return reply.moods !== null || reply.keep.length === 0
    ? 'Refaz a lista?'
    : 'Refaz a lista mantendo o resto?'
}

/** The comments that say something, each on one line. */
const saidComments = (reply: SentReply) =>
  reply.comments
    .map((c) => ({ ...c, comment: line(c.comment ?? '') }))
    .filter((c) => c.comment !== '')

/** The Dono's sentence for what she sent: "Troquei Cais 2. Iara já viu
 * Fronteira (nota 8). Refaz a lista mantendo o resto?" */
function spoken(reply: SentReply, people: readonly BillboardPerson[]) {
  const swapped = reply.dropped
    .filter((d) => d.cause === 'swapped')
    .map((d) => line(d.title ?? `o filme ${d.position}`))
  const sentences = [
    swapped.length > 0 && `Troquei ${andList(swapped)}.`,
    ...[...seenByTitle(reply.seen, people)].map(([title, seen]) =>
      seenSentence(title, seen),
    ),
    moodSentence(reply.moods),
    reply.addition !== null && `Acrescentei: “${line(reply.addition)}”.`,
    ...saidComments(reply).map(
      (c) =>
        `Sobre ${c.title ? line(c.title) : `o filme ${c.position}`}: “${c.comment}”.`,
    ),
    redoSentence(reply),
  ]
  return sentences.filter(Boolean).join(' ')
}

/** The words that open a second Enviar of the same version: it replaces
 * what went before, which Claude may be redoing already (#277). */
export const AGAIN = 'Corrigindo o que mandei:'

/** The Cartaz's tag, ending the Dono's message: short, so the bubble stays
 * hers (#277). The Session is the Cartaz's above it in the chat. */
const tagOf = (reply: SentReply) => `(pelo Cartaz · v${reply.version})`

/** What Claude gets after Enviar, when there is something for him: `text`,
 * the Dono's message, which ends in the Cartaz's tag ("pelo Cartaz ·
 * v<n>"), and `context`, what the tool recorded and the regenerate needs
 * (the ids to keep, the Climas, the free text), for the host's model
 * context. A host without one gets only `text`: Claude reads the rest
 * from the Session (`billboard`). `again` when a message of this version
 * went already: this one says it replaces it. Null when there is nothing
 * for him (stars, or Notas that dropped no film). */
export function replyMessage(
  reply: SentReply,
  people: readonly BillboardPerson[],
  again = false,
): { text: string; context: string } | null {
  const comments = saidComments(reply)
  if (!reply.regenerate && reply.addition === null && comments.length === 0)
    return null
  const tag = tagOf(reply)
  const said = [again && AGAIN, spoken(reply, people)].filter(Boolean).join(' ')
  const lines = [
    `Resposta do Cartaz ${reply.session.id} v${reply.version}, já gravada por answer_billboard (não chame de novo)${again ? '; substitui a anterior' : ''}:`,
    reply.regenerate &&
      `refazer · manter: ${reply.keep.length > 0 ? reply.keep.join(', ') : 'nenhum'}`,
    reply.moods !== null &&
      `clima: ${reply.moods.length > 0 ? reply.moods.join(', ') : 'nenhum'}`,
    reply.addition !== null && `acrescentar: ${line(reply.addition)}`,
    ...comments.map(
      (c) =>
        `comentário ${c.position} ${c.id}${c.title ? ` (${line(c.title)})` : ''}: ${c.comment}`,
    ),
  ]
  return {
    // The tag always fits: the Dono's words give way.
    text: `${said.slice(0, MESSAGE_LIMIT - tag.length - 1)}\n${tag}`,
    context: lines.filter(Boolean).join('\n').slice(0, MESSAGE_LIMIT),
  }
}
