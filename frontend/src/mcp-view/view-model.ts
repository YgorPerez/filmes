// What the MCP Apps view reads from the host and writes back, as pure
// functions: the Cartaz out of the `billboard` tool's result, and the
// message Claude gets after Enviar recorded the reply (`answer_billboard`).

import type { Billboard, BillboardReply } from '@filmes/engine'

/** The part of an MCP `CallToolResult` the view reads. */
export type ToolResult = {
  readonly isError?: boolean
  readonly content?: ReadonlyArray<{ readonly type: string; text?: string }>
}

type EngineError = { readonly error: { readonly message: string } }

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

/** The engine's error message of a failed result, or its text. */
export function errorOf(result: ToolResult): string {
  const json = jsonOf(result)
  if (isRecord(json) && isRecord(json.error))
    return String((json as EngineError).error.message)
  return result.content?.find((block) => block.type === 'text')?.text ?? ''
}

/** The Cartaz a `billboard` result carries; an error's message otherwise. */
export function billboardOf(
  result: ToolResult,
): { billboard: Billboard } | { error: string } {
  const json = jsonOf(result)
  if (!result.isError && isRecord(json) && isRecord(json.billboard))
    return { billboard: json.billboard as unknown as Billboard }
  return { error: errorOf(result) }
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

/** What Claude must hear after Enviar: the reply is recorded, and the
 * regenerate (`keep`), the acrescentar and the comments are his to read.
 * Null when there is nothing for him (stars, or Notas that dropped no film). */
export function replyMessage(
  reply: Pick<
    BillboardReply,
    'session' | 'version' | 'regenerate' | 'keep' | 'addition' | 'comments'
  >,
): string | null {
  const comments = reply.comments.filter((c) => line(c.comment ?? '') !== '')
  if (!reply.regenerate && reply.addition === null && comments.length === 0)
    return null
  const lines = [
    `Enviei o Cartaz ${reply.session.id} v${reply.version} pela tela; answer_billboard já gravou.`,
    reply.regenerate &&
      `refazer · manter: ${reply.keep.length > 0 ? reply.keep.join(', ') : 'nenhum'}`,
    reply.addition !== null && `acrescentar: ${line(reply.addition)}`,
    ...comments.map(
      (c) =>
        `comentário ${c.position} ${c.id}${c.title ? ` (${line(c.title)})` : ''}: ${line(c.comment ?? '')}`,
    ),
  ]
  return lines.filter(Boolean).join('\n').slice(0, MESSAGE_LIMIT)
}
