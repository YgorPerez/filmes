import type { Billboard as BillboardModel } from '@filmes/engine'
import { useEffect, useRef, useState } from 'react'
import { BILLBOARD } from './billboard.copy'
import {
  chosenMoods,
  hasMarks,
  markCounts,
  replyText,
  type Marks,
} from './billboard-marks'
import { buttonVariants } from './kit/button-variants'
import { FIELD } from './kit/field'
import { Option } from './kit/option'

// The reply's pieces (DESIGN.md, Botão principal and Acrescentar): the
// acrescentar box after the last film, with the Clima chips (#179) under it, Enviar (the screen's one orange
// button), Copiar pro chat (an option), the summary of what was marked and
// the status line. The Cartaz (`billboard.tsx`) places them per layout.

const { reply } = BILLBOARD

/** What was marked, in a line ("1 Trocar marcado · 1 Já vi"). */
export const summaryOf = (billboard: BillboardModel, marks: Marks) =>
  reply.summary(markCounts(billboard, marks))

/** Enviar: the form's submit on the web; without `onSend` there is no
 * other way. In the MCP Apps view a plain button, since a sandboxed frame
 * without `allow-forms` (the host's) never fires a submit. */
export function SendButton({
  onSend,
  className,
}: {
  onSend?: () => void
  className?: string
}) {
  return (
    <button
      type={onSend ? 'button' : 'submit'}
      onClick={onSend}
      className={buttonVariants({ className })}
    >
      {reply.send}
    </button>
  )
}

export function Status({ message }: { message: string }) {
  return message ? (
    <p role="status" className="text-meta">
      {message}
    </p>
  ) : null
}

/** Puts the text on the clipboard, or says it could not. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Copiar pro chat, and the box with the text selected when the clipboard
 * refused it. */
function Copy({
  text,
  onMessage,
}: {
  text: string
  onMessage: (message: string) => void
}) {
  const [manual, setManual] = useState<string | null>(null)
  const output = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (manual === null) return
    output.current?.focus()
    output.current?.select()
  }, [manual])

  const copy = async () => {
    if (!hasMarks(text)) {
      onMessage(reply.nothing)
      return
    }
    if (await copyText(text)) {
      setManual(null)
      onMessage(reply.copied)
    } else {
      setManual(text)
      onMessage(reply.select)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void copy()}
        className={buttonVariants({ variant: 'option' })}
      >
        {reply.copy}
      </button>
      {manual !== null && (
        <textarea
          ref={output}
          readOnly
          aria-label={reply.output}
          value={manual}
          rows={4}
          className={`${FIELD} basis-full font-mono text-[13px]`}
        />
      )}
    </>
  )
}

/** The Clima chips: the version's on, and a tap asks for another Clima,
 * which redoes the whole list. */
function MoodChips({
  billboard,
  marks,
  onMoods,
}: {
  billboard: BillboardModel
  marks: Marks
  onMoods: (moods: string[]) => void
}) {
  const on = chosenMoods(billboard, marks)
  const toggle = (mood: string) => (checked: boolean) =>
    onMoods(
      billboard.moodChoices.filter((m) => (m === mood ? checked : on.has(m))),
    )
  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="mb-xs font-display text-[14px] font-bold">
        {reply.moods}{' '}
        <span className="font-body font-normal text-ink-2">
          {reply.moodsHint}
        </span>
      </legend>
      <div className="flex flex-wrap gap-sm">
        {billboard.moodChoices.map((mood) => (
          <Option
            key={mood}
            name="clima"
            value={mood}
            checked={on.has(mood)}
            onChange={toggle(mood)}
          >
            {mood}
          </Option>
        ))}
      </div>
    </fieldset>
  )
}

/** The acrescentar box, after the last film. `send` is the Enviar that
 * goes in it (the web, Claude without fullscreen); in Claude's fullscreen
 * Enviar and the status live in the fixed foot instead. */
export function ReplyBox({
  billboard,
  marks,
  kept,
  message,
  onMessage,
  onAddition,
  onMoods,
  send,
}: {
  billboard: BillboardModel
  marks: Marks
  kept: boolean
  message: string
  onMessage: (message: string) => void
  onAddition: (text: string) => void
  onMoods: (moods: string[]) => void
  send?: { onSend?: () => void }
}) {
  const text = replyText(billboard, marks)
  const summary = summaryOf(billboard, marks)
  return (
    <section
      aria-labelledby="responder"
      className="flex flex-col gap-md rounded-card border border-rule bg-surface p-xl"
    >
      <h2 id="responder" className="sr-only">
        {reply.title}
      </h2>
      <label className="flex flex-col gap-xs">
        <span className="font-display text-[14px] font-bold">
          {reply.addition}{' '}
          <span className="font-body font-normal text-ink-2">
            {reply.additionHint}
          </span>
        </span>
        <textarea
          rows={2}
          value={marks.addition}
          onChange={(e) => onAddition(e.target.value)}
          className={FIELD}
        />
      </label>
      {billboard.moodChoices.length > 0 && (
        <MoodChips billboard={billboard} marks={marks} onMoods={onMoods} />
      )}
      <input type="hidden" name="texto" value={text} />
      {send && summary && <p className="text-meta text-ink-2">{summary}</p>}
      <div className="flex flex-wrap items-center gap-sm">
        {send && <SendButton onSend={send.onSend} />}
        <Copy text={text} onMessage={onMessage} />
      </div>
      {send && <Status message={message} />}
      {kept && <p className="text-meta text-ink-2">{reply.kept}</p>}
      <noscript>
        <p className="text-meta text-ink-2">{reply.noScript}</p>
      </noscript>
    </section>
  )
}
