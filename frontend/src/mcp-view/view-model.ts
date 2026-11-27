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

/** The Cartaz a `billboard` result carries; the error's code otherwise
 * (null when it has none). The view never shows the engine's words. */
export function billboardOf(
  result: ToolResult,
): { billboard: Billboard } | { error: string | null } {
  const json = jsonOf(result)
  if (!result.isError && isRecord(json) && isRecord(json.billboard))
    return { billboard: json.billboard as unknown as Billboard }
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

/** The Dono's sentence for what she sent: "Troquei Cais 2. Iara já viu
 * Fronteira (nota 8). Refaz a lista mantendo o resto?" */
function spoken(reply: SentReply, people: readonly BillboardPerson[]) {
  const swapped = reply.dropped
    .filter((d) => d.cause === 'swapped')
    .map((d) => line(d.title ?? `o filme ${d.position}`))
  // Who saw each film, the Dono first ("Eu e Iara já vimos").
  const seen = new Map<string, { people: string[]; ratings: string[] }>()
  for (const s of reply.seen) {
    const person = people.find((p) => p.slug === s.person)
    const name = person?.owner ? 'eu' : (person?.name ?? s.person)
    const entry = seen.get(s.title) ?? { people: [], ratings: [] }
    entry.people.push(name)
    if (s.rating !== null)
      entry.ratings.push(
        person?.owner
          ? `nota ${tenScale(s.rating)}`
          : `${person?.name ?? s.person} deu ${tenScale(s.rating)}`,
      )
    seen.set(s.title, entry)
  }
  const sentences = [
    swapped.length > 0 && `Troquei ${andList(swapped)}.`,
    ...[...seen].map(([title, { people: who, ratings }]) => {
      const names = who.toSorted((a, b) =>
        a === 'eu' ? -1 : b === 'eu' ? 1 : 0,
      )
      const subject =
        names.length === 1 && names[0] === 'eu'
          ? ''
          : `${andList(names).replace(/^eu/u, 'Eu')} `
      const verb =
        names.length > 1
          ? names[0] === 'eu'
            ? 'já vimos'
            : 'já viram'
          : names[0] === 'eu'
            ? 'Já vi'
            : 'já viu'
      const notes = ratings.length > 0 ? ` (${ratings.join(', ')})` : ''
      return `${subject}${verb} ${line(title)}${notes}.`
    }),
    reply.moods !== null &&
      (reply.moods.length > 0
        ? `Quero o clima ${andList(reply.moods)}.`
        : 'Tirei o clima.'),
    reply.addition !== null && `Acrescentei: “${line(reply.addition)}”.`,
    ...reply.comments
      .filter((c) => line(c.comment ?? '') !== '')
      .map(
        (c) =>
          `Sobre ${c.title ? line(c.title) : `o filme ${c.position}`}: “${line(c.comment ?? '')}”.`,
      ),
    reply.regenerate &&
      (reply.moods !== null || reply.keep.length === 0
        ? 'Refaz a lista?'
        : 'Refaz a lista mantendo o resto?'),
  ]
  return sentences.filter(Boolean).join(' ')
}

/** What Claude gets after Enviar, when there is something for him: `text`,
 * the Dono's message, which ends in the Cartaz's tag ("enviado pelo
 * Cartaz · <sessao> v<n>"), and `context`, what the tool recorded and the
 * regenerate needs (the ids to keep, the Climas, the free text), for the
 * host's model context. Null when there is nothing for him (stars, or
 * Notas that dropped no film). */
export function replyMessage(
  reply: SentReply,
  people: readonly BillboardPerson[],
): { text: string; context: string } | null {
  const comments = reply.comments.filter((c) => line(c.comment ?? '') !== '')
  if (!reply.regenerate && reply.addition === null && comments.length === 0)
    return null
  const tag = `(enviado pelo Cartaz · ${reply.session.id} v${reply.version})`
  const lines = [
    `Resposta do Cartaz ${reply.session.id} v${reply.version}, já gravada por answer_billboard (não chame de novo):`,
    reply.regenerate &&
      `refazer · manter: ${reply.keep.length > 0 ? reply.keep.join(', ') : 'nenhum'}`,
    reply.moods !== null &&
      `clima: ${reply.moods.length > 0 ? reply.moods.join(', ') : 'nenhum'}`,
    reply.addition !== null && `acrescentar: ${line(reply.addition)}`,
    ...comments.map(
      (c) =>
        `comentário ${c.position} ${c.id}${c.title ? ` (${line(c.title)})` : ''}: ${line(c.comment ?? '')}`,
    ),
  ]
  return {
    text: `${spoken(reply, people)}\n${tag}`.slice(0, MESSAGE_LIMIT),
    context: lines.filter(Boolean).join('\n').slice(0, MESSAGE_LIMIT),
  }
}

/** The message when the host takes no model context: the Dono's words,
 * then the detail Claude needs, within the host's limit. */
export const withContext = (message: { text: string; context: string }) =>
  `${message.text}\n${message.context}`.slice(0, MESSAGE_LIMIT)
