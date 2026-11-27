import type { FilmCard, RatingQueue } from '@filmes/engine'
import { MY_TASTE, RATINGS_PATH } from '#/content/paths'
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react'
import { ratingField, type RatingRefusal } from '#/content/rating-form'
import type { SearchAnswer } from '#/platform/catalog-search'
import { useFetchForm, type Answered } from './kit/fetch-form'
import { usePostedFeedback } from './kit/posted-feedback'
import { Chip } from './kit/chip'
import { PageHead } from './kit/page-head'
import { TapeCase } from './kit/tape-case'
import { ImportsFrame } from './imports'
import { Alert, CatalogSearch, Meta, Notice, PostFailed } from './person-parts'
import {
  lastTaken,
  loadDraft,
  parseDraft,
  saveDraft,
  sending,
  settle,
  storedDraft,
  undoLast,
  withoutRating,
  withRating,
  withSkipped,
  type Draft,
} from './rating-draft'
import { RatingDisc } from './person-marks'
import { RATINGS } from './ratings.copy'
import { buttonVariants } from './kit/button-variants'
import { Button } from './shadcn/button'

// The rating screen (#144; #274 made it say what each tap did): one film
// of the Fila de Notas at a time, the scale of 1 to 10 or "Não vi", and a
// bar stuck above the tabs with the Notas of this sitting, how many she
// has toward the next ten, and Pronto.

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** The Nota a digit key gives on the rating card: 1 to 9, and 0 for 10. */
const digitRating = (key: string) =>
  /^[0-9]$/.test(key) ? Number(key) || 10 : null

/** How the screen asks for a film's card (poster, synopsis, directors):
 * the route's server function; none in the tests and the stories that
 * leave the server alone. */
export type LoadCard = (film: string) => Promise<FilmCard | null>

/** The film on the card: the year and the genres (from the Fila) in chips,
 * the directors and the runtime under the title. */
type CardFilm = {
  id: string
  title: string
  year: number | null
  genres: readonly string[]
  directors: readonly string[]
  runtime: number | null
}

/** Another tab changed the storage. */
const subscribe = (changed: () => void) => {
  window.addEventListener('storage', changed)
  return () => window.removeEventListener('storage', changed)
}

const yearText = (year: number | null) => (year === null ? null : `${year}`)

const taken = (draft: Draft, id: string) =>
  id in draft.ratings || draft.skipped.includes(id)

/** The films to rate, in order: the one picked in the search, until it has
 * a Nota or is passed over; then the Fila's the draft has not taken. */
function filmsLeft(
  queue: RatingQueue,
  draft: Draft,
  search: SearchAnswer | null,
  film: string | undefined,
): CardFilm[] {
  const picked =
    film !== undefined && search && 'found' in search && !taken(draft, film)
      ? search.found.films.find((f) => f.id === film)
      : undefined
  const fromQueue = queue.films.filter(
    (f) => !taken(draft, f.id) && f.id !== picked?.id,
  )

  return picked
    ? [{ ...picked, genres: [], runtime: null }, ...fromQueue]
    : fromQueue
}

/** The next ten: 10 for a Dono with fewer, else the ten above what she has. */
const nextGoal = (n: number) => Math.max(10, (Math.floor(n / 10) + 1) * 10)

/** The rating screen (`RATINGS_PATH`). The Notas wait in the browser's
 * draft until Pronto posts them to `/notas/enviar`, which writes them in
 * one commit and comes back saying how many (`written`); with the
 * JavaScript, by `fetch`, without a reload (#240). `queue` is null when
 * the engine cannot run on this server. */
export function RatingScreen({
  queue,
  search,
  film,
  written,
  refusal,
  loadCard,
}: {
  queue: RatingQueue | null
  search: SearchAnswer | null
  film?: string
  written?: number
  refusal?: RatingRefusal
  loadCard?: LoadCard
}) {
  const { feedback, onAnswer } = usePostedFeedback()
  return (
    <ImportsFrame back={RATINGS.back} backTo={MY_TASTE}>
      <PageHead title={RATINGS.title} lead={RATINGS.lead} />
      {refusal && (
        <div ref={feedback}>
          <Alert>{RATINGS.refusals[refusal]}</Alert>
        </div>
      )}
      {queue === null ? (
        <Alert>{RATINGS.unavailable}</Alert>
      ) : (
        <Rating
          queue={queue}
          search={search}
          film={film}
          written={written}
          settled={written !== undefined ? 'written' : refusal && 'refused'}
          onAnswer={onAnswer}
          feedback={refusal ? undefined : feedback}
          loadCard={loadCard}
        />
      )}
    </ImportsFrame>
  )
}

/** The draft as the page holds it. What the server's page had: none. In
 * the browser, the stored one, settled by Pronto's answer, until the Dono
 * changes it; each change is stored at once. */
function useDraft(person: string, settled?: 'written' | 'refused') {
  const stored = useSyncExternalStore(
    subscribe,
    () => storedDraft(person),
    () => null,
  )
  const [edited, setEdited] = useState<Draft | null>(null)
  const kept = parseDraft(stored)
  const draft = edited ?? (settled ? settle(kept, settled === 'written') : kept)
  useEffect(() => {
    if (settled)
      saveDraft(person, settle(loadDraft(person), settled === 'written'))
  }, [person, settled])
  const change = (next: Draft) => {
    saveDraft(person, next)
    setEdited(next)
  }
  return [draft, change] as const
}

/** The cards the screen asked for, by film; each asked once. */
function useCards(loadCard: LoadCard | undefined, ids: readonly string[]) {
  const [cards, setCards] = useState<Record<string, FilmCard | null>>({})
  const asked = useRef(new Set<string>())
  const wanted = ids.join(' ')
  useEffect(() => {
    if (!loadCard) return
    for (const id of wanted.split(' ')) {
      if (id === '' || asked.current.has(id)) continue
      asked.current.add(id)
      loadCard(id).then(
        (card) => setCards((all) => ({ ...all, [id]: card })),
        () => setCards((all) => ({ ...all, [id]: null })),
      )
    }
  }, [loadCard, wanted])
  return cards
}

/** Pronto's answer, in the address it comes back to: written (`feito`)
 * or refused (`erro`), heard by `settled`; anything else, nothing. */
function settleAnswer(to: string, settled: (written: boolean) => void) {
  const answer = new URL(to, window.location.origin).searchParams
  if (answer.has('feito') || answer.has('erro')) settled(answer.has('feito'))
}

/** The address a search result's pick opens: the film on the card,
 * with the search kept. */
const pickIn = (search: SearchAnswer | null) => (id: string) => {
  const params = new URLSearchParams({ filme: id })
  if (search) params.set('buscar', search.query)
  return `${RATINGS_PATH}?${params.toString()}`
}

/** What a tap on the card does to the draft, and what it says aloud
 * (`say`, null for nothing, which also takes the focus back to the card's
 * title). `names`
 * are the current film's and the next one's. */
function taps({
  draft,
  change,
  queue,
  current,
  say,
  names: [name, nextName],
}: {
  draft: Draft
  change: (next: Draft) => void
  queue: RatingQueue
  current: CardFilm | undefined
  say: (text: string | null) => void
  names: readonly [string, string | null]
}) {
  return {
    rate: (rating: number) => {
      if (!current) return
      change(withRating(draft, current, rating))
      say(RATINGS.announceRated(rating, name, nextName))
    },
    skip: () => {
      if (!current) return
      change(withSkipped(draft, current.id))
      say(RATINGS.announceSkipped(name, nextName))
    },
    undo: () => {
      const back = lastTaken(draft)
      change(undoLast(draft))
      const backTitle =
        (back && draft.ratings[back]?.title) ??
        queue.films.find((f) => f.id === back)?.title
      say(backTitle ? RATINGS.announceUndone(backTitle) : null)
    },
  }
}

/** Pronto's answer, heard without a reload: written, the sent Notas leave
 * the draft; refused, they stay. */
type OnAnswer = (to: string, form: HTMLFormElement) => Answered

type RatingProps = {
  queue: RatingQueue
  search: SearchAnswer | null
  film?: string
  written?: number
  settled?: 'written' | 'refused'
  onAnswer: OnAnswer
  feedback?: RefObject<HTMLDivElement | null>
  loadCard?: LoadCard
}

function Rating({
  queue,
  search,
  film,
  written,
  settled,
  onAnswer,
  feedback,
  loadCard,
}: RatingProps) {
  const sitting = useSitting(queue, settled, onAnswer)
  const { draft, change, goal } = sitting
  const voice = useVoice()
  const left = filmsLeft(queue, draft, search, film)
  const [current, next] = left
  const cards = useCards(
    loadCard,
    left.slice(0, 2).map((f) => f.id),
  )
  const count = queue.rated + Object.keys(draft.ratings).length
  const nameOf = (f?: CardFilm) => f && (cards[f.id]?.titlePt ?? f.title)
  const actions = taps({
    draft,
    change,
    queue,
    current,
    say: voice.say,
    names: [nameOf(current) ?? '', nameOf(next) ?? null],
  })
  return (
    <>
      <Announced text={voice.announced} />
      <Stage
        queue={queue}
        written={written}
        feedback={feedback}
        sitting={sitting}
        voice={voice}
        actions={actions}
        film={current}
        card={current && cards[current.id]}
      />
      <DraftList
        draft={draft}
        onRemove={(id) => change(withoutRating(draft, id))}
      />
      <RatingSearch search={search} />
      <RatingBar
        draft={draft}
        count={count}
        goal={goal}
        onSend={() => saveDraft(queue.person, sending(draft))}
        onAnswer={sitting.sent}
      />
    </>
  )
}

/** What each tap did, aloud (`aria-live`, not a status: the page's status
 * is what the last post did). */
function Announced({ text }: { text: string }) {
  return (
    <p aria-live="polite" className="sr-only">
      {text}
    </p>
  )
}

/** What the screen holds above the draft: after Pronto, how many went in;
 * with the goal reached, the ten; else the last tap and the film to rate. */
function Stage({
  queue,
  written,
  feedback,
  sitting,
  voice,
  actions,
  film,
  card,
}: {
  queue: RatingQueue
  written?: number
  feedback?: RefObject<HTMLDivElement | null>
  sitting: ReturnType<typeof useSitting>
  voice: ReturnType<typeof useVoice>
  actions: ReturnType<typeof taps>
  film: CardFilm | undefined
  card: FilmCard | null | undefined
}) {
  const { draft, goal, setGoal, more, setMore } = sitting
  const rated = Object.keys(draft.ratings).length
  const count = queue.rated + rated
  if (written !== undefined && !more)
    return (
      <WrittenBlock
        written={written}
        count={queue.rated}
        feedback={feedback}
        onMore={() => {
          setMore(true)
          setGoal(nextGoal(queue.rated))
          voice.say(null)
        }}
      />
    )
  if (count >= goal && rated > 0)
    return <GoalBlock goal={goal} onMore={() => setGoal(nextGoal(count))} />
  return (
    <>
      <LastTaken draft={draft} queue={queue} onUndo={actions.undo} />
      <CardOrOver
        film={film}
        card={card}
        titleRef={voice.title}
        onRate={actions.rate}
        onSkip={actions.skip}
      />
    </>
  )
}

/** The Catálogo search, to rate a film the Fila does not hold. */
function RatingSearch({ search }: { search: SearchAnswer | null }) {
  return (
    <CatalogSearch
      action={RATINGS_PATH}
      scope="films"
      answer={search}
      pick={pickIn(search)}
      pickAs={{ text: RATINGS.pick, label: RATINGS.pickLabel }}
      lead={RATINGS.searchLead}
    />
  )
}

/** The sitting: the draft, the goal, whether the Dono asked for more after
 * Pronto (`more`), and Pronto's answer (`sent`), which settles the draft. */
function useSitting(
  queue: RatingQueue,
  settled: 'written' | 'refused' | undefined,
  onAnswer: OnAnswer,
) {
  const [draft, change] = useDraft(queue.person, settled)
  const [goal, setGoal] = useState(() => nextGoal(queue.rated))
  const [more, setMore] = useState(false)
  const sent: OnAnswer = (to, form) => {
    settleAnswer(to, (written) =>
      change(settle(loadDraft(queue.person), written)),
    )
    setMore(false)
    return onAnswer(to, form)
  }
  return { draft, change, goal, setGoal, more, setMore, sent }
}

/** What the screen says aloud, and the card's title the focus goes back
 * to: `say` takes the words (null for none) and moves the focus. */
function useVoice() {
  const [announced, setAnnounced] = useState('')
  const title = useRef<HTMLHeadingElement>(null)
  const say = (text: string | null) => {
    if (text !== null) setAnnounced(text)
    requestAnimationFrame(() => title.current?.focus())
  }
  return { announced, title, say }
}

/** The film to rate, or the word that the Fila is over. */
function CardOrOver({
  film,
  ...card
}: Omit<Parameters<typeof FilmCardView>[0], 'film'> & {
  film: CardFilm | undefined
}) {
  if (!film) return <p className="text-ink-2">{RATINGS.over}</p>
  return <FilmCardView film={film} {...card} />
}

/** After Pronto: how many went in, in the hand note the next step, and
 * the two ways on. */
function WrittenBlock({
  written,
  count,
  feedback,
  onMore,
}: {
  written: number
  count: number
  /** Where the page's posted feedback lands. */
  feedback?: RefObject<HTMLDivElement | null>
  onMore: () => void
}) {
  return (
    <div ref={feedback}>
      <WrittenNote written={written} count={count} onMore={onMore} />
    </div>
  )
}

function WrittenNote({
  written,
  count,
  onMore,
}: {
  written: number
  count: number
  onMore: () => void
}) {
  return (
    <section className="flex flex-col gap-lg rounded-card border border-rule bg-surface p-xl">
      <Notice>{RATINGS.written(written)}</Notice>
      {count >= 10 && (
        <p className="font-hand text-hand-large leading-tight text-ink">
          {RATINGS.writtenNext}
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        <a href="/sessoes/nova" className={buttonVariants()}>
          {RATINGS.ask}
        </a>
        <Button variant="option" onClick={onMore}>
          {RATINGS.moreRatings}
        </Button>
      </div>
    </section>
  )
}

/** The ten reached: the card waits until she asks for ten more. */
function GoalBlock({ goal, onMore }: { goal: number; onMore: () => void }) {
  return (
    <section className="flex flex-col gap-lg rounded-card border border-rule bg-surface p-xl">
      <p className="font-hand text-hand-large leading-tight text-ink">
        {RATINGS.goal(goal)}
      </p>
      <p className="text-ink-2">{RATINGS.goalLead}</p>
      <Button variant="option" className="self-start" onClick={onMore}>
        {RATINGS.more}
      </Button>
    </section>
  )
}

/** The last tap, on its disc as it sticks on, with "Voltar ao anterior". */
function LastTaken({
  draft,
  queue,
  onUndo,
}: {
  draft: Draft
  queue: RatingQueue
  onUndo: () => void
}) {
  const id = lastTaken(draft)
  if (id === undefined) return null
  const entry = draft.ratings[id]
  const title =
    entry?.title ?? queue.films.find((f) => f.id === id)?.title ?? id
  return (
    <div className="-mb-lg flex min-h-touch items-center gap-md">
      {entry ? (
        <span key={draft.history.length} className="motion-safe:animate-stick">
          <RatingDisc>{entry.rating}</RatingDisc>
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-meta text-ink-2">
        {entry ? RATINGS.lastRated(title) : RATINGS.lastSkipped(title)}
      </span>
      <Button
        variant="link"
        aria-label={RATINGS.undoLabel(title)}
        onClick={onUndo}
      >
        {RATINGS.undo}
      </Button>
    </div>
  )
}

/** The Notas not yet written, each on its orange disc with "Tirar"; only
 * when there is one. */
function DraftList({
  draft,
  onRemove,
}: {
  draft: Draft
  onRemove: (id: string) => void
}) {
  const rated = Object.entries(draft.ratings)
  if (rated.length === 0) return null
  return (
    <section aria-labelledby="minhas-notas" className="flex flex-col gap-xs">
      <h2
        id="minhas-notas"
        className="font-display text-label text-ink-2 uppercase"
      >
        {RATINGS.draft}
      </h2>
      <ul className="flex flex-col">
        {rated.map(([id, entry]) => (
          <li
            key={id}
            className="flex items-center gap-lg border-rule py-sm not-first:border-t"
          >
            <RatingDisc>{entry.rating}</RatingDisc>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-display text-row-title">{entry.title}</span>
              <Meta
                parts={[yearText(entry.year), RATINGS.rate(entry.rating)]}
              />
            </span>
            <Button
              variant="link"
              aria-label={RATINGS.remove(entry.title)}
              onClick={() => onRemove(id)}
            >
              {RATINGS.removeLabel}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The bar stuck above the tabs (the Cartaz's send bar): the last Notas
 * of the draft on small discs, how many she has toward the goal, and
 * Pronto, the screen's one orange button, which posts the draft (by
 * `fetch` once the JavaScript is in). With nothing to send, Pronto says so
 * instead of posting. */
function RatingBar({
  draft,
  count,
  goal,
  onSend,
  onAnswer,
}: {
  draft: Draft
  count: number
  goal: number
  onSend: () => void
  onAnswer: OnAnswer
}) {
  const rated = Object.entries(draft.ratings)
  const { onSubmit, busy, failed } = useFetchForm(onAnswer)
  const [empty, setEmpty] = useState(false)
  return (
    <section
      aria-label={RATINGS.bar}
      className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-10 -mx-lg flex flex-col gap-2xs rounded-t-panel border-x border-t border-rule bg-surface px-lg py-sm min-[900px]:bottom-0"
    >
      <form
        method="post"
        action="/notas/enviar"
        className="flex items-center justify-between gap-md"
        onSubmit={(event) => {
          if (rated.length === 0) {
            event.preventDefault()
            setEmpty(true)
            return
          }
          setEmpty(false)
          onSend()
          onSubmit(event)
        }}
      >
        {rated.map(([id, entry]) => (
          <input
            key={id}
            type="hidden"
            name={ratingField(id)}
            value={entry.rating}
          />
        ))}
        <Progress draft={draft} count={count} goal={goal} />
        <button
          type="submit"
          className={buttonVariants({ className: 'shrink-0' })}
          disabled={busy !== null}
        >
          {busy === null ? RATINGS.done(rated.length) : RATINGS.writing}
        </button>
      </form>
      {empty && rated.length === 0 && (
        <p className="text-meta text-ink">{RATINGS.nothing}</p>
      )}
      <PostFailed failed={failed} />
    </section>
  )
}

/** The last Notas of the draft on small discs, and how many she has
 * toward the goal. */
function Progress({
  draft,
  count,
  goal,
}: {
  draft: Draft
  count: number
  goal: number
}) {
  const recent = draft.history
    .filter((id) => id in draft.ratings)
    .slice(-5)
    .map((id) => [id, draft.ratings[id]?.rating ?? 0] as const)
  return (
    <div className="flex min-w-0 items-center gap-sm">
      <span aria-hidden="true" className="flex -space-x-2">
        {recent.map(([id, rating]) => (
          <SmallDisc key={id}>{rating}</SmallDisc>
        ))}
      </span>
      <span
        aria-label={RATINGS.progressLabel(count, goal)}
        className="font-display text-row-title tabular-nums"
      >
        {RATINGS.progress(count, goal)}
      </span>
    </div>
  )
}

/** A Nota of the draft in the bar: the orange disc, small. */
function SmallDisc({ children }: { children: ReactNode }) {
  return (
    <span className="inline-grid size-7 place-items-center rounded-round border-2 border-surface bg-sticker-orange font-display text-meta-strong text-on-sticker tabular-nums">
      {children}
    </span>
  )
}

/** The film to rate: on its tape (the poster, or the title on the cover),
 * the Portuguese title with the original under it, the directors, the
 * year and the runtime, the synopsis in two lines, the genres; then the
 * scale of 1 to 10 (DESIGN.md, Escala de nota): two rows of five on a
 * phone, so each number keeps a 44px target. A tap on a number is the
 * Nota; with the focus on the card, so is a digit key (0 for 10). */
function FilmCardView({
  film,
  card,
  titleRef,
  onRate,
  onSkip,
}: {
  film: CardFilm
  card?: FilmCard | null
  titleRef: RefObject<HTMLHeadingElement | null>
  onRate: (rating: number) => void
  onSkip: () => void
}) {
  const shown = card?.titlePt ?? film.title
  return (
    <article
      aria-label={RATINGS.queueLabel}
      onKeyDown={(event) => {
        const rating = digitRating(event.key)
        if (rating === null || event.altKey || event.ctrlKey || event.metaKey)
          return
        event.preventDefault()
        onRate(rating)
      }}
      className="flex flex-col gap-xl rounded-card border border-rule bg-surface p-xl pt-2xl"
    >
      <div className="flex gap-xl">
        <TapeCase
          className="w-[96px] sm:w-[120px]"
          cover={
            card?.poster ? (
              <img
                src={card.poster}
                alt={RATINGS.poster(shown)}
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <span aria-hidden="true">{shown}</span>
            )
          }
        />
        <CardDetails film={film} card={card} titleRef={titleRef} />
      </div>
      <Scale onRate={onRate} />
      <Button variant="option" className="self-start" onClick={onSkip}>
        {RATINGS.notSeen}
      </Button>
    </article>
  )
}

/** The film's titles, directors, year, runtime, synopsis and genres. */
function CardDetails({
  film,
  card,
  titleRef,
}: {
  film: CardFilm
  card?: FilmCard | null
  titleRef: RefObject<HTMLHeadingElement | null>
}) {
  const shown = card?.titlePt ?? film.title
  const directors = card?.directors ?? film.directors
  const runtime = card?.runtime ?? film.runtime
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-sm">
      <div className="flex flex-col gap-2xs">
        <h2
          ref={titleRef}
          tabIndex={-1}
          className="font-display text-title outline-none"
        >
          {shown}
        </h2>
        {shown !== film.title && (
          <p className="text-meta font-light text-ink-2">
            {RATINGS.original(film.title)}
          </p>
        )}
      </div>
      <Meta
        parts={[
          directors.length > 0 ? RATINGS.directedBy(directors) : null,
          yearText(film.year),
          runtime === null ? null : RATINGS.runtime(runtime),
        ]}
      />
      {card?.synopsis && (
        <p className="line-clamp-2 text-meta text-ink-2">{card.synopsis}</p>
      )}
      {film.genres.length > 0 && (
        <div className="flex flex-wrap gap-xs">
          {film.genres.map((genre) => (
            <Chip key={genre}>{genre}</Chip>
          ))}
        </div>
      )}
    </div>
  )
}

/** The scale of 1 to 10: a tap on a number is the Nota. */
function Scale({ onRate }: { onRate: (rating: number) => void }) {
  return (
    <div className="flex flex-col gap-xs border-t border-dashed border-rule pt-xl">
      <div
        role="group"
        aria-label={RATINGS.scale}
        className="grid grid-cols-5 gap-0.75 min-[480px]:grid-cols-10"
      >
        {SCALE.map((rating) => (
          <button
            key={rating}
            type="button"
            aria-label={RATINGS.rate(rating)}
            onClick={() => onRate(rating)}
            className="min-h-touch cursor-pointer rounded-rail border-(length:--border-width-stroke) border-rule bg-surface font-display text-field-label text-ink tabular-nums hover:border-ink active:border-sticker-orange active:bg-sticker-orange active:text-on-sticker"
          >
            {rating}
          </button>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="flex justify-between text-meta text-ink-2"
      >
        <span>{RATINGS.scaleLow}</span>
        <span>{RATINGS.scaleHigh}</span>
      </div>
    </div>
  )
}
