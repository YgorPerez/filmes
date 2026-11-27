import type { Billboard as BillboardModel } from '@filmes/engine'
import { useEffect, useRef, useState } from 'react'
import { BILLBOARD } from './billboard.copy'
import { chosenMoods, hasMarks, type Marks } from './billboard-marks'
import { buttonVariants } from './kit/button-variants'
import { Icon } from './kit/icon'
import { FIELD } from './kit/field'
import { Option } from './kit/option'

// The reply's pieces (DESIGN.md, Botão principal, Acrescentar and Barra
// de envio): the acrescentar box after the last film, with the Clima chips
// (#179) folded under "Mudar o clima" and, on the web, Copiar pro chat
// under it; and the bar that follows the Dono down the Cartaz with what she
// marked, the status line and Enviar (the screen's one orange button). In
// Claude, Copiar shows in the bar only when Enviar could not go (#277).
// The Cartaz (`billboard.tsx`) places them.

const { reply } = BILLBOARD

/** Enviar: the form's submit on the web; without `onSend` there is no
 * other way. In the MCP Apps view a plain button, since a sandboxed frame
 * without `allow-forms` (the host's) never fires a submit. */
export function SendButton({
  onSend,
  className,
  sending = false,
  sent = false,
  retry = false,
}: {
  sending?: boolean
  /** This very reply went already: nothing to send until a mark changes
   * (#277). */
  sent?: boolean
  /** The last try failed. */
  retry?: boolean
  onSend?: () => void
  className?: string
}) {
  return (
    <button
      type={onSend ? 'button' : 'submit'}
      onClick={onSend}
      disabled={sent}
      className={buttonVariants({
        className: `${className ?? ''} disabled:cursor-default disabled:bg-surface-2 disabled:text-ink-2`,
      })}
    >
      {sending
        ? BILLBOARD.view.sending
        : sent
          ? reply.sent
          : retry
            ? reply.retry
            : reply.send}
    </button>
  )
}

export function Status({ message }: { message: string }) {
  return message ? (
    <p role="status" className="text-meta text-pretty">
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
export function Copy({
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
          className={`${FIELD} basis-full font-mono text-url`}
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
  // Folded: any chip redoes the whole list, so it takes a tap to reach
  // them (#277); open once the Dono changed the Clima.
  return (
    <details
      open={marks.moods !== null}
      className="group/moods rounded-field border border-rule"
    >
      {/* The kit's fold (#272): the drawn +, a × while open. */}
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-sm px-3 font-display text-field-label select-none [&::-webkit-details-marker]:hidden">
        {reply.moodsOpen}
        <Icon
          name="plus"
          className="size-[18px] text-ink-2 transition-[rotate] group-open/moods:rotate-45 motion-reduce:transition-none"
        />
      </summary>
      <fieldset className="flex flex-col gap-xs border-t border-rule p-lg">
        <legend className="mb-xs font-display text-field-label">
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
    </details>
  )
}

/** The acrescentar box, after the last film: the acrescentar, the Clima
 * chips and Copiar pro chat. */
export function ReplyBox({
  billboard,
  marks,
  kept,
  onAddition,
  onMoods,
}: {
  billboard: BillboardModel
  marks: Marks
  kept: boolean
  onAddition: (text: string) => void
  onMoods: (moods: string[]) => void
}) {
  return (
    <section
      aria-labelledby="responder"
      className="flex flex-col gap-md rounded-card border border-rule bg-surface p-xl"
    >
      {/* Visible, at the step of a page's titles: it sits among the film
          titles, and must not read below them (#277). */}
      <h2 id="responder" className="font-display text-page-title">
        {reply.title}
      </h2>
      <label className="flex flex-col gap-xs">
        <span className="font-display text-field-label">
          {reply.addition}{' '}
          <span className="font-body font-normal text-ink-2">
            {reply.additionHint}
          </span>
        </span>
        <textarea
          id="acrescentar"
          rows={2}
          value={marks.addition}
          onChange={(e) => onAddition(e.target.value)}
          className={FIELD}
        />
      </label>
      {billboard.moodChoices.length > 0 && (
        <MoodChips billboard={billboard} marks={marks} onMoods={onMoods} />
      )}
      {/* No Copiar pro chat here: the web sends the reply itself (#272),
          and in Claude, Copiar shows in the bar when Enviar cannot go
          (#277). */}
      {kept && <p className="text-meta text-ink-2">{reply.kept}</p>}
      <noscript>
        <p className="text-meta text-ink-2">{reply.noScript}</p>
      </noscript>
    </section>
  )
}

/** Where the bar sticks: `tabs` flush on the app's bottom tabs on a
 * phone and on the window's bottom from 900px (the web), `foot` at the
 * bottom of the frame, full width (Claude's fullscreen), `end` at the
 * bottom of a frame the host sizes to the content, where sticking does
 * nothing. */
export type BarPlace = 'tabs' | 'foot' | 'end'

const BAR: Record<BarPlace, string> = {
  tabs: 'bottom-[calc(68px+env(safe-area-inset-bottom))] rounded-t-panel border-x border-t min-[900px]:bottom-0',
  // Above the box the host lays over its foot (`--host-inset-bottom`, from
  // the host's safe area, #277); `env()` is 0 inside a frame.
  foot: 'bottom-0 border-t px-2xl pb-[max(10px,var(--host-inset-bottom,0px),env(safe-area-inset-bottom))]',
  end: 'bottom-0 rounded-panel border',
}

/** The bar with what was marked, the status line and Enviar. It sticks
 * to the bottom while the Cartaz is on screen, so Enviar is a thumb away
 * from any film. */
export function ReplyBar({
  summary,
  moods = null,
  message,
  onSend,
  place,
  sending,
  sent,
  retry,
  copy,
  onMessage,
  unread,
}: {
  summary: string
  /** The Climas the Dono chose, when they are not the version's: in bold,
   * since they redo the whole list (#277). */
  moods?: readonly string[] | null
  message: string
  onSend?: () => void
  place: BarPlace
  sending?: boolean
  sent?: boolean
  retry?: boolean
  /** The text for Copiar, beside the status, when Enviar could not go. */
  copy?: string | null
  onMessage?: (message: string) => void
  /** The acrescentar's words the reading did not take: the bar asks
   * whether to send it as it is (#272). */
  unread?: { words: readonly string[]; onEdit: () => void }
}) {
  // In Claude's fullscreen the bar spans the frame and its content keeps
  // the Cartaz's column (#277).
  const column = place === 'foot' ? 'mx-auto w-full max-w-[688px]' : ''
  return (
    <section
      aria-label={reply.bar}
      className={`sticky z-10 flex flex-col gap-2xs border-rule bg-surface px-lg py-sm ${BAR[place]}`}
    >
      {unread ? (
        <div role="alert" className={`flex flex-col gap-sm py-2xs ${column}`}>
          <p className="text-meta text-pretty text-ink">
            {reply.unread(unread.words)}
          </p>
          <div className="flex flex-wrap justify-end gap-sm">
            <button
              type="button"
              onClick={unread.onEdit}
              className={buttonVariants({ variant: 'option' })}
            >
              {reply.edit}
            </button>
            <button
              type="submit"
              name="confirmar"
              value="sim"
              className={buttonVariants()}
            >
              {reply.sendAnyway}
            </button>
          </div>
        </div>
      ) : (
        <div className={`flex items-center justify-between gap-md ${column}`}>
          <p className="min-w-0 text-meta text-ink-2">
            {summary || (moods === null ? reply.hint : '')}
            {moods !== null && (
              <>
                {summary !== '' && ' · '}
                <strong className="font-bold text-ink">
                  {reply.moodsChosen(moods)}
                </strong>
              </>
            )}
          </p>
          <SendButton
            onSend={onSend}
            sending={sending}
            sent={sent}
            retry={retry}
            className="shrink-0"
          />
        </div>
      )}
      {(message || copy) && (
        <div className={`flex flex-wrap items-center gap-sm ${column}`}>
          <Status message={message} />
          {copy && onMessage && <Copy text={copy} onMessage={onMessage} />}
        </div>
      )}
    </section>
  )
}
