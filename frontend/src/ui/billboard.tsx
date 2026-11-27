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
import { linesOnTop } from './billboard-closed'
import { InlineBillboard, Standing, type RowTag } from './billboard-inline'
import {
  emptyMarks,
  forgetMarks,
  hasMarks,
  markCounts,
  markedFilms,
  marksOf,
  withSwap,
  openStorage,
  otherMoods,
  parseMarks,
  replyText,
  saveMarks,
  storedMarks,
  type FilmMarks,
  type Marks,
} from './billboard-marks'
import { ReplyBar, ReplyBox, type BarPlace } from './billboard-reply'
import { askedParts } from './billboard-request'
import { buttonVariants } from './kit/button-variants'
import { Dropped, Legend, PeopleLegend } from './billboard-top'
import { BILLBOARD } from './billboard.copy'
import { HandNote, ShelfLabel } from './kit/shelf-label'

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
// they survive the switch between the two. A reply that went is not sent
// again: Enviar reads "Enviado ✓" until a mark changes (#277).

type Layout = 'page' | 'inline' | 'fullscreen'

/** What became of an Enviar in the view: the status line, whether the
 * reply went, and, when it did not, whether Copiar is the way out (the
 * host cannot send) or a new try may do. */
export type SendOutcome = {
  readonly message: string
  readonly sent: boolean
  readonly copy?: boolean
}

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
   * promise gives is the outcome. */
  onSend?: (text: string) => void | Promise<SendOutcome>
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
  single = false,
}: {
  billboard: BillboardModel
  compact?: boolean | 'narrow'
  /** One line with the version, and the Dono's words left to the body:
   * the fixed top of Claude's fullscreen (#277). */
  single?: boolean
}) {
  return (
    <ShelfLabel
      compact={compact}
      single={single}
      tag={
        single && billboard.version > 1
          ? BILLBOARD.view.version(billboard.version)
          : undefined
      }
      items={[billboard.request.who, ...askedParts(billboard.request.parts)]}
      note={single ? null : billboard.request.speech}
      added={single ? [] : billboard.request.additions}
    />
  )
}

/** The marks and the status line over them: a new mark clears it (#272,
 * #277). */
function useReplyMarks(billboard: BillboardModel, sent: boolean) {
  const [message, setMessage] = useState('')
  const { marks, change, canKeep } = useMarks(billboard, sent, () =>
    setMessage(''),
  )
  return { message, setMessage, marks, change, canKeep }
}

/** Why a hand-over that did not go failed: Copiar, or a new try. */
const failureOf = (outcome: SendOutcome) => {
  if (outcome.sent) return null
  return outcome.copy ? 'copy' : 'retry'
}

/** Enviar: the web form posts only a reply; the view hands the text over
 * instead, once per reply. `isSent` while the text is the one that went;
 * `failure` says why the last try did not. */
function useSend({
  text,
  onSend,
  post,
  setMessage,
}: {
  text: string
  onSend: Props['onSend']
  post: Props['post']
  setMessage: (message: string) => void
}) {
  const [sentText, setSentText] = useState<string | null>(null)
  const [failure, setFailure] = useState<'retry' | 'copy' | null>(null)
  const [busy, setBusy] = useState(false)
  const isSent = sentText === text
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (onSend === undefined && hasMarks(text)) {
      post?.onSubmit(event)
      return
    }
    event.preventDefault()
    if (onSend === undefined) setMessage(BILLBOARD.reply.nothing)
  }
  const send = (handOver: NonNullable<Props['onSend']>) => () => {
    if (!hasMarks(text)) {
      setMessage(BILLBOARD.reply.nothing)
      return
    }
    if (isSent || busy) return
    const going = text
    const outcome = handOver(going)
    if (!outcome) return
    setBusy(true)
    setMessage(BILLBOARD.view.sending)
    void outcome.then((o) => {
      setBusy(false)
      setMessage(o.message)
      setFailure(failureOf(o))
      if (o.sent) setSentText(going)
    })
  }
  return { submit, onSendClick: onSend && send(onSend), isSent, failure }
}

/** The tags on the inline card's rows: what each film was marked with
 * (#277). */
function rowTags(billboard: BillboardModel, marks: Marks) {
  const tags: Record<string, RowTag[]> = {}
  for (const film of billboard.films) {
    const own = marksOf(marks, film.id)
    const kinds: RowTag[] = []
    if (own.swap) kinds.push('swap')
    if (own.seen.length > 0) kinds.push('seen')
    if (kinds.length > 0) tags[film.id] = kinds
  }
  return tags
}

/** Where the bar sits: the web has the app's tabs at the bottom of a
 * phone; Claude's fullscreen, its own foot; a frame sized to the content,
 * nothing. */
function barPlace(fullscreen: boolean, viewed: boolean): BarPlace {
  if (fullscreen) return 'foot'
  return viewed ? 'end' : 'tabs'
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
  const { message, setMessage, marks, change, canKeep } = useReplyMarks(
    billboard,
    sent,
  )
  const text = replyText(billboard, marks)
  const { submit, onSendClick, isSent, failure } = useSend({
    text,
    onSend,
    post,
    setMessage,
  })
  const copy = failure === 'copy' ? text : null

  if (layout === 'inline' && onExpand)
    return (
      <InlineBillboard
        billboard={billboard}
        marked={BILLBOARD.reply.marked(markedFilms(billboard, marks))}
        tags={rowTags(billboard, marks)}
        sent={isSent}
        message={message}
        copy={copy}
        onMessage={setMessage}
        onExpand={onExpand}
        onSend={onSendClick}
        onClear={() => change(emptyMarks())}
      />
    )

  const replying = billboard.open && billboard.films.length > 0
  const fullscreen = layout === 'fullscreen'
  // What was marked, in a sentence ("1 Trocar e 1 Já vi"); the Clima
  // apart, in bold.
  const bar = replying && (
    <ReplyBar
      summary={BILLBOARD.reply.summary({
        ...markCounts(billboard, marks),
        mood: false,
      })}
      moods={otherMoods(billboard, marks)}
      message={message}
      onSend={onSendClick}
      place={barPlace(fullscreen, onSend !== undefined)}
      sending={post?.sending}
      sent={isSent}
      retry={failure === 'retry'}
      copy={copy}
      onMessage={setMessage}
      unread={unread}
    />
  )
  const shelf = (
    <Shelf
      billboard={billboard}
      marks={marks}
      change={change}
      canKeep={canKeep}
      viewed={onSend !== undefined}
      headed={fullscreen || onSend !== undefined}
    />
  )
  const body = fullscreen ? (
    <FullscreenBody billboard={billboard} bar={bar}>
      {shelf}
    </FullscreenBody>
  ) : (
    <div className="flex flex-col gap-2xl">
      {onSend ? (
        <ViewTop billboard={billboard} shelf={shelf} />
      ) : (
        <PageTop billboard={billboard} shelf={shelf} after={after} />
      )}
      {bar}
    </div>
  )

  if (!replying) return body
  return (
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
  )
}

/** The fullscreen: the request fixed on top, the Dono's words, what left
 * (or, once closed, that it is and the Filme escolhido, as inline), the
 * Presentes and the shelf, the bar at the foot. */
function FullscreenBody({
  billboard,
  bar,
  children,
}: {
  billboard: BillboardModel
  bar: ReactNode
  children: ReactNode
}) {
  const speech = billboard.request.speech
  return (
    <Fullscreen
      top={<Request billboard={billboard} compact single />}
      foot={bar}
    >
      {speech && (
        <div className="flex">
          <HandNote compact>{speech}</HandNote>
        </div>
      )}
      {billboard.request.additions.map((words) => (
        <div key={words} className="flex">
          <HandNote compact tilt="right">{`+ ${words}`}</HandNote>
        </div>
      ))}
      <Standing billboard={billboard} block />
      {billboard.films.length > 0 && (
        <PeopleLegend billboard={billboard} named={linesOnTop(billboard)} />
      )}
      {children}
    </Fullscreen>
  )
}

/** Claude without fullscreen: no page head names the Presentes; what left,
 * or the closed Session's lines, come under the request, as inline. */
function ViewTop({
  billboard,
  shelf,
}: {
  billboard: BillboardModel
  shelf: ReactNode
}) {
  return (
    <>
      <Request billboard={billboard} compact="narrow" />
      <Standing billboard={billboard} block />
      <PeopleLegend billboard={billboard} named={linesOnTop(billboard)} />
      <Capped>{shelf}</Capped>
    </>
  )
}

/** The web: the request beside the legend, what left, the shelf and what
 * comes after it. */
function PageTop({
  billboard,
  shelf,
  after,
}: {
  billboard: BillboardModel
  shelf: ReactNode
  after: ReactNode
}) {
  return (
    <>
      <div className="flex flex-col gap-xs">
        <div className="flex items-start justify-between gap-md">
          <Request billboard={billboard} />
          <Legend />
        </div>
        {billboard.open && <Dropped billboard={billboard} />}
      </div>
      {shelf}
      {after}
    </>
  )
}

/** The shelf: why it is empty, the Filme escolhido, the cards and, while
 * the Dono replies, the acrescentar and the Climas. */
function Shelf({
  billboard,
  marks,
  change,
  canKeep,
  viewed,
  headed,
}: {
  billboard: BillboardModel
  marks: Marks
  change: (next: Marks) => void
  canKeep: boolean
  /** In the MCP Apps view. */
  viewed: boolean
  /** Under a head that says where the version stands (`Standing`): the
   * fullscreen and the view without one, not the web. */
  headed: boolean
}) {
  const empty = billboard.films.length === 0
  return (
    <>
      {empty && (
        <p className="text-ink-2">
          {viewed
            ? BILLBOARD.view.empty(billboard.request.parts)
            : BILLBOARD.empty}
        </p>
      )}
      <ChosenFilm chosen={billboard.chosen} people={billboard.attendees} />
      <Cards
        billboard={billboard}
        marks={marks}
        change={change}
        reactionsOnTop={headed && linesOnTop(billboard)}
      />
      {billboard.open && !empty && (
        <ReplyBox
          billboard={billboard}
          marks={marks}
          kept={canKeep}
          onAddition={(addition) => change({ ...marks, addition })}
          onMoods={(moods) => change({ ...marks, moods })}
        />
      )}
    </>
  )
}

type Film = BillboardModel['films'][number]

/** A film without the lines and the "sem fato" its section says once. */
const withoutShared = (
  film: Film,
  shared: ReadonlySet<string>,
  without: ReadonlySet<string>,
) =>
  shared.size === 0 && without.size === 0
    ? film
    : {
        ...film,
        lines: film.lines.filter((l) => !shared.has(lineKey(l))),
        withoutFact: film.withoutFact.filter((slug) => !without.has(slug)),
      }

/** A card per film, under the section of its Motivo when there are
 * sections. */
function Cards({
  billboard,
  marks,
  change,
  reactionsOnTop,
}: {
  billboard: BillboardModel
  marks: Marks
  change: (next: Marks) => void
  /** The head says the chosen film's lines (#351). */
  reactionsOnTop: boolean
}) {
  const grouped = billboard.sections.length > 0
  const card = (film: Film) => (
    <BillboardCard
      key={film.id}
      film={film}
      people={billboard.attendees}
      first={film === billboard.films[0]}
      level={grouped ? 3 : 2}
      reactionsOnTop={reactionsOnTop}
      marks={billboard.open ? marksOf(marks, film.id) : undefined}
      onChange={
        billboard.open
          ? (next: FilmMarks) =>
              change({
                ...marks,
                films: {
                  ...marks.films,
                  [film.id]: withSwap(
                    marksOf(marks, film.id),
                    next,
                    billboard.request.unseen,
                  ),
                },
              })
          : undefined
      }
    />
  )
  if (!grouped) return <>{billboard.films.map(card)}</>
  const byId = new Map(billboard.films.map((film) => [film.id, film]))
  return (
    <>
      {billboard.sections.map((section) => {
        const films = section.films.flatMap((id) => byId.get(id) ?? [])
        const shared = sharedLines(films)
        const without = sharedWithoutFact(films)
        const own = new Set(shared.map(lineKey))
        const none = new Set(without)
        return (
          <Section
            key={section.films[0]}
            section={section}
            shared={shared}
            without={without}
            people={billboard.attendees}
          >
            {films.map((film) => card(withoutShared(film, own, none)))}
          </Section>
        )
      })}
    </>
  )
}

/** A section by Motivo (DESIGN.md, Seção do Cartaz): the title beside a 4px bar
 * in ink (the stamp's violet for the Aposta), "de novo" when
 * the Motivo was above already, and its cards. */
function Section({
  section,
  shared,
  without,
  people,
  children,
}: {
  section: BillboardModel['sections'][number]
  shared: readonly BillboardLine[]
  without: readonly string[]
  people: readonly BillboardPerson[]
  children: ReactNode
}) {
  const id = `secao-${section.films[0]}`
  const bet = section.kind === 'bet'
  return (
    <section aria-labelledby={id} className="flex flex-col gap-lg">
      <h2
        id={id}
        className={`border-l-4 pl-sm font-display text-page-title text-balance ${bet ? 'border-stamp text-stamp' : 'border-ink text-ink'}`}
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
      {(shared.length > 0 || without.length > 0) && (
        <SharedLines lines={shared} without={without} people={people} />
      )}
      {children}
    </section>
  )
}

/** Claude's fullscreen: the request fixed on top, one line, the Dono's
 * words, the legend and the shelf scrolling, the bar fixed at the foot,
 * above the host's message box (its safe area, `--host-inset-*`); with
 * no bar, the content ends above that box. The content keeps the web's
 * column, centred (#277). */
function Fullscreen({
  top,
  foot,
  children,
}: {
  top: ReactNode
  foot: ReactNode
  children: ReactNode
}) {
  const column = 'mx-auto w-full max-w-[720px] px-2xl'
  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <header className="sticky top-[var(--host-inset-top,0px)] z-10 border-b border-rule bg-ground py-sm">
        <div className={column}>{top}</div>
      </header>
      <div className={`flex flex-1 flex-col gap-2xl py-2xl ${column}`}>
        {children}
      </div>
      {/* With no bar (a closed or an empty Cartaz), the end of the shelf
          clears the host's message box by itself (#277). */}
      {!foot && (
        <div aria-hidden="true" className="h-(--host-inset-bottom) shrink-0" />
      )}
      {foot}
    </div>
  )
}

/** A host without fullscreen sizes the frame to the content: the shelf is
 * capped there, with "Ver o Cartaz inteiro", so the bar stays in reach
 * (#277). */
function Capped({ children }: { children: ReactNode }) {
  const [whole, setWhole] = useState(false)
  const [cut, setCut] = useState(false)
  if (whole) return <>{children}</>
  return (
    <div className="relative flex flex-col gap-2xl">
      <div
        ref={(box) => {
          if (box) setCut(box.scrollHeight > box.clientHeight)
        }}
        className="flex max-h-[880px] flex-col gap-2xl overflow-hidden"
      >
        {children}
      </div>
      {cut && (
        // Narrow, the shelf sits on the frame's floor, not on the ground
        // (`billboard-view.tsx`).
        <div className="absolute inset-x-0 bottom-0 flex justify-center border-t border-rule bg-view-floor pt-md min-[560px]:bg-ground">
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setWhole(true)}
            className={buttonVariants({ variant: 'option' })}
          >
            {BILLBOARD.view.seeAll}
          </button>
        </div>
      )}
    </div>
  )
}

/** An Evidência line by what it says and whose it is. */
const lineKey = (line: BillboardLine) =>
  `${line.people.join(' ')}:${line.strength}:${line.against}:${line.text}`

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

/** The Presentes with no Fato about any film of a section of two films
 * or more (#272): said once with its shared lines, never lost with them. */
function sharedWithoutFact(
  films: readonly BillboardModel['films'][number][],
): string[] {
  const [first, ...rest] = films
  if (!first || rest.length === 0) return []
  return first.withoutFact.filter((slug) =>
    rest.every((film) => film.withoutFact.includes(slug)),
  )
}

/** The shared lines and who has no Fato, under a section's title. */
function SharedLines({
  lines,
  without,
  people,
}: {
  lines: readonly BillboardLine[]
  without: readonly string[]
  people: readonly BillboardPerson[]
}) {
  const known = new Map(people.map((p) => [p.slug, p]))
  const absent = new Set(without)
  const nobody = people.filter((p) => absent.has(p.slug))
  return (
    <div className="flex flex-col gap-xs pl-md">
      <p className="font-display text-label text-ink-2 uppercase">
        {BILLBOARD.shared}
      </p>
      <ul aria-label={BILLBOARD.shared} className="flex flex-col gap-2.25">
        {lines.map((line) => (
          <EvidenceLine key={lineKey(line)} line={line} people={known} />
        ))}
        {nobody.length > 0 && (
          <li className="text-evidence text-ink-2">
            {BILLBOARD.sharedWithoutFact(BILLBOARD.names(nobody))}
          </li>
        )}
      </ul>
    </div>
  )
}
