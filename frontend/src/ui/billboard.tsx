import type { Billboard as BillboardModel } from '@filmes/engine'
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react'
import { Avatar, BillboardCard } from './billboard-card'
import {
  forgetMarks,
  hasMarks,
  markCounts,
  marksOf,
  openStorage,
  parseMarks,
  replyText,
  saveMarks,
  storedMarks,
  type FilmMarks,
  type Marks,
} from './billboard-marks'
import { BILLBOARD } from './billboard.copy'
import { Marquee } from './marquee'

// The Cartaz [billboard] of a Session (`cartaz/__init__.py`, `cartaz.js`):
// the reading of the request on the letreiro, what left the previous
// version, a card per film and, while the Session is open, the reply: the
// marks per film, the acrescentar below the last film, Enviar and Copiar
// pro chat. It renders the engine's `billboardModel` and builds the text
// `answerBillboard` reads (`billboardText`).
//
// Nothing of the app here, so the MCP Apps view (#111) renders the same
// component: on the web Enviar posts the text to `action`; in the view,
// `onSend` gets it.

type Props = {
  billboard: BillboardModel
  /** Where Enviar posts the text (field `texto`): the web. */
  action?: string
  /** Gets the text instead of the post: the MCP Apps view. */
  onSend?: (text: string) => void
  /** The marks of this version were sent: forget the kept ones. */
  sent?: boolean
}

function Top({ billboard: b }: { billboard: BillboardModel }) {
  return (
    <div className="flex flex-col gap-sm">
      <Marquee
        words={[b.request.who, ...b.request.parts]}
        label={[b.request.who, ...b.request.parts].join(' · ')}
      />
      {b.request.speech && (
        <p className="text-[14px] text-ink-2 italic">“{b.request.speech}”</p>
      )}
      <p className="flex flex-wrap items-center gap-x-[14px] gap-y-xs text-meta text-ink-2">
        {b.attendees.map((p) => (
          <span
            key={p.slug}
            className="inline-flex items-center gap-xs text-ink"
          >
            <Avatar person={p} />
            {p.name}
          </span>
        ))}
        <span>{BILLBOARD.legend}</span>
      </p>
      {b.dropped.length > 0 && (
        <p className="text-meta text-ink-2">
          {BILLBOARD.dropped}{' '}
          {b.dropped
            .map((d) => `${d.position} ${d.title} (${d.reason})`)
            .join(' · ')}
        </p>
      )}
    </div>
  )
}

/** Puts the text on the clipboard, or in a selected box to copy by hand. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

// DESIGN.md's buttons (`ui/shadcn/button.tsx`), drawn here so the Cartaz
// stands alone in the MCP Apps view: Enviar is the screen's red one.
const button =
  'inline-flex min-h-touch cursor-pointer items-center justify-center rounded-pill px-[22px] text-button select-none'

function Reply({
  billboard,
  marks,
  kept,
  message,
  onMessage: setMessage,
  onAddition,
}: {
  billboard: BillboardModel
  marks: Marks
  kept: boolean
  message: string
  onMessage: (message: string) => void
  onAddition: (text: string) => void
}) {
  const { reply } = BILLBOARD
  const [manual, setManual] = useState<string | null>(null)
  const output = useRef<HTMLTextAreaElement>(null)
  const text = replyText(billboard, marks)
  const summary = reply.summary(markCounts(billboard, marks))

  useEffect(() => {
    if (manual === null) return
    output.current?.focus()
    output.current?.select()
  }, [manual])

  const copy = async () => {
    if (!hasMarks(text)) {
      setMessage(reply.nothing)
      return
    }
    if (await copyText(text)) {
      setManual(null)
      setMessage(reply.copied)
    } else {
      setManual(text)
      setMessage(reply.select)
    }
  }

  return (
    <section
      aria-labelledby="responder"
      className="flex flex-col gap-[10px] rounded-card border border-rule bg-surface p-md"
    >
      <h2 id="responder" className="sr-only">
        {reply.title}
      </h2>
      <label className="flex flex-col gap-xs">
        <span className="text-[14px] font-semibold">
          {reply.addition}{' '}
          <span className="font-normal text-ink-2">{reply.additionHint}</span>
        </span>
        <textarea
          rows={2}
          value={marks.addition}
          onChange={(e) => onAddition(e.target.value)}
          className="min-h-touch rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink"
        />
      </label>
      <input type="hidden" name="texto" value={text} />
      {summary && <p className="text-meta text-ink-2">{summary}</p>}
      <div className="flex flex-wrap gap-sm">
        <button
          type="submit"
          className={`${button} bg-marquee-red text-on-red`}
        >
          {reply.send}
        </button>
        <button
          type="button"
          onClick={() => void copy()}
          className={`${button} border border-rule bg-surface text-ink`}
        >
          {reply.copy}
        </button>
      </div>
      {message && (
        <p role="status" className="text-meta">
          {message}
        </p>
      )}
      {manual !== null && (
        <textarea
          ref={output}
          readOnly
          aria-label={reply.output}
          value={manual}
          rows={4}
          className="rounded-field border border-rule bg-surface px-3 py-[9px] font-mono text-[13px] text-ink"
        />
      )}
      {kept && <p className="text-meta text-ink-2">{reply.kept}</p>}
      <noscript>
        <p className="text-meta text-ink-2">{reply.noScript}</p>
      </noscript>
    </section>
  )
}

/** Another tab changed the storage. */
const subscribe = (changed: () => void) => {
  window.addEventListener('storage', changed)
  return () => window.removeEventListener('storage', changed)
}

export function Billboard({ billboard, action, onSend, sent = false }: Props) {
  // What the server's page had: no marks and no storage. In the browser,
  // the kept marks, until the Dono changes one; none once they were sent.
  const kept = useSyncExternalStore(
    subscribe,
    () => (sent ? null : storedMarks(billboard)),
    () => null,
  )
  const canKeep = useSyncExternalStore(
    subscribe,
    () => openStorage() !== null,
    () => false,
  )
  const [edited, setEdited] = useState<Marks | null>(null)
  const marks = edited ?? parseMarks(kept, billboard)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (sent) forgetMarks(openStorage(), billboard)
  }, [billboard, sent])

  const change = (next: Marks) => {
    setEdited(next)
    saveMarks(openStorage(), billboard, next)
  }
  const changeFilm = (id: string) => (film: FilmMarks) =>
    change({ ...marks, films: { ...marks.films, [id]: film } })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    const text = replyText(billboard, marks)
    if (!hasMarks(text) || onSend) event.preventDefault()
    if (!hasMarks(text)) setMessage(BILLBOARD.reply.nothing)
    else onSend?.(text)
  }

  const cards = billboard.films.map((film, i) => (
    <BillboardCard
      key={film.id}
      film={film}
      people={billboard.attendees}
      first={i === 0}
      marks={billboard.open ? marksOf(marks, film.id) : undefined}
      onChange={billboard.open ? changeFilm(film.id) : undefined}
    />
  ))

  return (
    <div className="flex flex-col gap-md">
      <Top billboard={billboard} />
      {billboard.films.length === 0 && (
        <p className="text-ink-2">{BILLBOARD.empty}</p>
      )}
      {billboard.open && billboard.films.length > 0 ? (
        <form
          method="post"
          action={action}
          onSubmit={submit}
          aria-label={BILLBOARD.label}
          className="flex flex-col gap-md"
        >
          {cards}
          <Reply
            billboard={billboard}
            marks={marks}
            kept={canKeep}
            message={message}
            onMessage={setMessage}
            onAddition={(addition) => change({ ...marks, addition })}
          />
        </form>
      ) : (
        cards
      )}
    </div>
  )
}
