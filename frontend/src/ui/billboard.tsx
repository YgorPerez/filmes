import type {
  Billboard as BillboardModel,
  BillboardLine,
  BillboardPerson,
} from '@filmes/engine'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react'
import { BillboardCard, EvidenceLine } from './billboard-card'
import { ChosenFilm } from './billboard-chosen'
import { InlineBillboard } from './billboard-inline'
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
import { ReplyBar, ReplyBox, type BarPlace } from './billboard-reply'
import { Dropped, Legend } from './billboard-top'
import { BILLBOARD } from './billboard.copy'
import { ShelfLabel } from './kit/shelf-label'

// The Cartaz [billboard] of a Session (`cartaz/__init__.py`, `cartaz.js`):
// the request on the shelf label, the legend, what left the previous
// version, a card per film under the title of its Motivo (#183; a Session
// from before has the cards alone) and, while the Session is open, the
// reply: the marks on each card; the acrescentar, the Clima chips and
// Copiar pro chat after the last film; and the bar with what was marked
// and Enviar, stuck to the bottom while the Cartaz is on screen (#221). It
// renders the engine's `billboardModel` and builds the text
// `answerBillboard` reads (`billboardText`).
//
// Nothing of the app here, so the MCP Apps view (#111) renders the same
// component: on the web Enviar posts the text to `action`; in the view,
// `onSend` gets it. The view picks the layout (DESIGN.md, Dentro do
// Claude): `inline` is the compact card in the conversation, `fullscreen`
// the one to mark films in, with the shelf label fixed on top. The marks live here, so
// they survive the switch between the two.

type Layout = 'page' | 'inline' | 'fullscreen'

type Props = {
  billboard: BillboardModel
  /** Where Enviar posts the text (field `texto`): the web. */
  action?: string
  post?: {
    onSubmit: (event: FormEvent<HTMLFormElement>) => void
    busy: boolean
    sending: boolean
  }
  /** Gets the text instead of the post: the MCP Apps view. What its
   * promise gives is the status line. */
  onSend?: (text: string) => void | Promise<string>
  /** The marks of this version were sent: forget the kept ones. */
  sent?: boolean
  layout?: Layout
  /** Marcar on the inline card: asks the host for the fullscreen. */
  onExpand?: () => void
  /** The acrescentar's words the web's reading did not take (#272): the
   * bar asks before anything is sent. `onEdit` puts the Dono back in the
   * acrescentar. */
  unread?: { words: readonly string[]; onEdit: () => void }
  /** After the last film, on the web: "Contar como foi" (#272). */
  after?: ReactNode
}

/** Another tab changed the storage. */
const subscribe = (changed: () => void) => {
  window.addEventListener('storage', changed)
  return () => window.removeEventListener('storage', changed)
}

/** The marks: what the server's page had (none, no storage); in the
 * browser, the kept ones until the Dono changes one; none once sent. */
function useMarks(
  billboard: BillboardModel,
  sent: boolean,
  onChange?: () => void,
) {
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

  useEffect(() => {
    if (sent) forgetMarks(openStorage(), billboard)
  }, [billboard, sent])

  const change = (next: Marks) => {
    onChange?.()
    setEdited(next)
    saveMarks(openStorage(), billboard, next)
  }
  return { marks, change, canKeep }
}

function Request({
  billboard,
  compact = false,
}: {
  billboard: BillboardModel
  compact?: boolean
}) {
  return (
    <ShelfLabel
      compact={compact}
      items={[billboard.request.who, ...billboard.request.parts]}
      note={billboard.request.speech}
    />
  )
}

export function Billboard({
  billboard,
  action,
  post,
  onSend,
  sent = false,
  layout = 'page',
  onExpand,
  unread,
  after,
}: Props) {
  const [message, setMessage] = useState('')
  // A status line speaks of the marks as they were: a new mark clears it.
  const { marks, change, canKeep } = useMarks(billboard, sent, () =>
    setMessage(''),
  )
  const text = replyText(billboard, marks)

  const changeFilm = (id: string) => (film: FilmMarks) =>
    change({ ...marks, films: { ...marks.films, [id]: film } })

  // Send the web form only when there is a reply.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (onSend === undefined && hasMarks(text)) {
      post?.onSubmit(event)
      return
    }
    event.preventDefault()
    if (onSend === undefined) setMessage(BILLBOARD.reply.nothing)
  }
  // The view hands the text over instead.
  const send = (handOver: NonNullable<Props['onSend']>) => () => {
    if (!hasMarks(text)) {
      setMessage(BILLBOARD.reply.nothing)
      return
    }
    const status = handOver(text)
    if (status) {
      setMessage(BILLBOARD.view.sending)
      void status.then(setMessage)
    }
  }
  const onSendClick = onSend && send(onSend)
  const empty = billboard.films.length === 0
  const replying = billboard.open && !empty

  // What was marked, in a sentence ("1 Trocar e 1 Já vi").
  const summary = BILLBOARD.reply.summary(markCounts(billboard, marks))
  if (layout === 'inline' && onExpand)
    return (
      <InlineBillboard
        billboard={billboard}
        summary={summary}
        message={message}
        onExpand={onExpand}
        onSend={onSendClick}
      />
    )

  const grouped = billboard.sections.length > 0
  const card = (film: BillboardModel['films'][number]) => (
    <BillboardCard
      key={film.id}
      // Once told, what came new in the last redo no longer matters.
      film={billboard.open ? film : { ...film, new: false }}
      people={billboard.attendees}
      first={film === billboard.films[0]}
      level={grouped ? 3 : 2}
      marks={billboard.open ? marksOf(marks, film.id) : undefined}
      onChange={billboard.open ? changeFilm(film.id) : undefined}
    />
  )
  const byId = new Map(billboard.films.map((film) => [film.id, film]))
  const cards = grouped
    ? billboard.sections.map((section) => {
        const films = section.films.flatMap((id) => byId.get(id) ?? [])
        const shared = sharedLines(films)
        const own = new Set(shared.map(lineKey))
        return (
          <Section
            key={section.films[0]}
            section={section}
            shared={shared}
            people={billboard.attendees}
          >
            {films.map((film) =>
              card(
                own.size === 0
                  ? film
                  : {
                      ...film,
                      lines: film.lines.filter((l) => !own.has(lineKey(l))),
                    },
              ),
            )}
          </Section>
        )
      })
    : billboard.films.map(card)
  const fullscreen = layout === 'fullscreen'
  // The web has the app's tabs at the bottom of a phone; Claude's
  // fullscreen, its own foot; a frame sized to the content, nothing.
  const place: BarPlace = fullscreen ? 'foot' : onSend ? 'end' : 'tabs'
  const bar = replying && (
    <ReplyBar
      summary={summary}
      message={message}
      onSend={onSendClick}
      place={place}
      sending={post?.sending}
      unread={unread}
    />
  )
  const shelf = (
    <>
      {empty && <p className="text-ink-2">{BILLBOARD.empty}</p>}
      <ChosenFilm chosen={billboard.chosen} people={billboard.attendees} />
      {cards}
      {replying && (
        <ReplyBox
          billboard={billboard}
          marks={marks}
          text={text}
          kept={canKeep}
          onMessage={setMessage}
          copy={onSend !== undefined}
          onAddition={(addition) => change({ ...marks, addition })}
          onMoods={(moods) => change({ ...marks, moods })}
        />
      )}
    </>
  )

  const body = fullscreen ? (
    <Fullscreen top={<Request billboard={billboard} compact />} foot={bar}>
      {billboard.open && <Dropped billboard={billboard} />}
      <Legend />
      {shelf}
    </Fullscreen>
  ) : (
    <div className="flex flex-col gap-2xl">
      <div className="flex flex-col gap-xs">
        <div className="flex items-start justify-between gap-md">
          <Request billboard={billboard} />
          <Legend />
        </div>
        {billboard.open && <Dropped billboard={billboard} />}
      </div>
      {shelf}
      {after}
      {bar}
    </div>
  )

  return replying ? (
    <form
      method="post"
      action={action}
      onSubmit={submit}
      aria-label={BILLBOARD.label}
    >
      <input type="hidden" name="texto" value={text} />
      <input type="hidden" name="acrescentar" value={marks.addition} />
      {post ? (
        <fieldset className="min-w-0" disabled={post.busy}>
          {body}
        </fieldset>
      ) : (
        body
      )}
    </form>
  ) : (
    body
  )
}

/** A section by Motivo (DESIGN.md, Seção do Cartaz): the title beside a 4px bar
 * in ink (the stamp's violet for the Aposta), "de novo" when
 * the Motivo was above already, and its cards. */
function Section({
  section,
  shared,
  people,
  children,
}: {
  section: BillboardModel['sections'][number]
  shared: readonly BillboardLine[]
  people: readonly BillboardPerson[]
  children: ReactNode
}) {
  const id = `secao-${section.films[0]}`
  const bet = section.kind === 'bet'
  return (
    <section aria-labelledby={id} className="flex flex-col gap-lg">
      <h2
        id={id}
        className={`border-l-4 pl-sm font-display text-step-title text-balance ${bet ? 'border-stamp text-stamp' : 'border-ink text-ink'}`}
      >
        {section.title}
        {section.again && (
          <>
            {' '}
            <span className="font-body text-meta font-normal text-ink-2">
              {BILLBOARD.section.again}
            </span>
          </>
        )}
      </h2>
      {shared.length > 0 && <SharedLines lines={shared} people={people} />}
      {children}
    </section>
  )
}

/** Claude's fullscreen: the request fixed on top, the legend and the
 * shelf scrolling, the bar fixed at the foot, above the host's message box
 * (its safe area). */
function Fullscreen({
  top,
  foot,
  children,
}: {
  top: ReactNode
  foot: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-sm border-b border-rule bg-ground px-2xl py-md">
        {top}
      </header>
      <div className="flex flex-1 flex-col gap-2xl p-2xl">{children}</div>
      {foot}
    </div>
  )
}

/** An Evidência line by what it says and whose it is. */
const lineKey = (line: BillboardLine) =>
  `${line.people.join(' ')}:${line.strength}:${line.text}`

/** The lines every film of a section has, when it has two films or more
 * (#272): said once under the title, so each card keeps what is its own. */
function sharedLines(
  films: readonly BillboardModel['films'][number][],
): BillboardLine[] {
  const [first, ...rest] = films
  if (!first || rest.length === 0) return []
  return first.lines.filter((line) =>
    rest.every((film) => film.lines.some((l) => lineKey(l) === lineKey(line))),
  )
}

/** The shared lines, under a section's title. */
function SharedLines({
  lines,
  people,
}: {
  lines: readonly BillboardLine[]
  people: readonly BillboardPerson[]
}) {
  const known = new Map(people.map((p) => [p.slug, p]))
  return (
    <div className="flex flex-col gap-xs pl-md">
      <p className="font-display text-label text-ink-2 uppercase">
        {BILLBOARD.shared}
      </p>
      <ul aria-label={BILLBOARD.shared} className="flex flex-col gap-2.25">
        {lines.map((line) => (
          <EvidenceLine key={lineKey(line)} line={line} people={known} />
        ))}
      </ul>
    </div>
  )
}
