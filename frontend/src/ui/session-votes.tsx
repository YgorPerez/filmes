import {
  useEffect,
  useRef,
  useState,
  type FormEventHandler,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  votePath,
  type VoteNotice,
  type VoteRefusal,
} from '#/content/session-votes-address'
import type { VoteDeck } from '#/platform/session-votes'
import { buttonVariants } from './kit/button-variants'
import { useFetchForm, useHydrated } from './kit/fetch-form'
import { Icon } from './kit/icon'
import { Alert, Notice, PostFailed } from './kit/status'
import { NewSticker, Sticker } from './kit/sticker'
import { FilmSheet } from './film-sheet'
import { LinkFilmList, VotedActions, VoteRule } from './session-link'
import { PARTICIPATION } from './session-link.copy'
import { VOTES } from './session-votes.copy'
import { useOrder } from './vote-order'
import { VoteRanking } from './vote-ranking'

// The group swipe's deck (#182, #275, #377): one film at a time over the
// whole screen, Tinder-like: the poster, and on a translucent band at the
// bottom (DESIGN.md has no gradients) the title, the facts and her own
// Nota prevista. Four gestures, by the round buttons, the arrow keys or by
// dragging the card (it follows the finger and gets its sticker near the
// line): left ✕ não, right ♥ sim, up ★ vi e gostei, down 👎 vi e não
// gostei (#378). A "vi" takes the film out like a não, and tells what she
// thought of it. A film that came in after her last Voto has the NOVO
// sticker (#380). A tap on the card opens its full sheet (`film-sheet.tsx`),
// where she can answer too. What each gesture does stays over the card.
// After the last film, the recap, where a tap changes an answer, and
// Enviar votos, the screen's one orange button, which posts every answer
// at once; with two or more sins, Pôr em ordem leads first to her Ordem
// (#379, `vote-ranking.tsx`), whose Enviar votos posts it too. A screen
// reader hears each new card. Her standing
// Votos on the screen go again with the new ones: her latest submission is
// the one that counts.

/** What she answers on a card: a Voto, or a Vi e gostei / Vi e não
 * gostei. */
type Vote = 'yes' | 'no' | 'seenLiked' | 'seenDisliked'

/** The form field each answer posts in. */
const FIELD: Readonly<Record<Vote, string>> = {
  yes: 'sim',
  no: 'nao',
  seenLiked: 'gostei',
  seenDisliked: 'naogostei',
}

const isSeen = (vote: Vote | undefined) =>
  vote === 'seenLiked' || vote === 'seenDisliked'

/** How many sins, nãos and "vi" in `votes`. */
const tally = (votes: readonly Vote[]) => {
  const yes = votes.filter((v) => v === 'yes').length
  const no = votes.filter((v) => v === 'no').length
  return [yes, no, votes.length - yes - no] as const
}

/** Where the deck is: a card up, the recap, or her Ordem. */
type Step = 'cards' | 'recap' | 'ranking'

/** How far the card must be dragged to count as a Voto, in pixels. */
const SWIPE = 60

/** The card's turn per pixel dragged, in degrees. */
const TURN = 0.06

const still = () =>
  typeof window === 'undefined' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Film = VoteDeck['films'][number]

/** The Votos cast so far, a film each in order, and what the live region
 * says. After each Voto, the next card's title takes the focus; after the
 * last, the recap's title, and the live region says the count. */
function useVotes(films: readonly Film[], kept: readonly Vote[] = []) {
  const [votes, setVotes] = useState<Vote[]>([...kept])
  const [said, setSaid] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const recap = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  const film = films[votes.length]

  useEffect(() => {
    if (!moved.current) return
    if (film) heading.current?.focus()
    else recap.current?.focus()
  }, [film])

  const cast = (vote: Vote) => {
    moved.current = true
    const next = films[votes.length + 1]
    setSaid(
      next
        ? VOTES.now(votes.length + 2, films.length, next.title)
        : VOTES.end(...tally([...votes, vote])),
    )
    setVotes((v) => [...v, vote].slice(0, films.length))
  }
  const back = () => {
    moved.current = true
    const previous = films[votes.length - 1]
    if (previous) setSaid(VOTES.wentBack(previous.title))
    setVotes((v) => v.slice(0, -1))
  }
  const change = (i: number, to: Vote) =>
    setVotes((v) => v.map((vote, j) => (j === i ? to : vote)))
  const restart = () => setVotes([])
  return {
    votes,
    said,
    say: setSaid,
    film,
    heading,
    recap,
    cast,
    back,
    change,
    restart,
  }
}

/** The arrow key of each answer. */
const KEYS: Readonly<Record<string, Vote>> = {
  ArrowLeft: 'no',
  ArrowRight: 'yes',
  ArrowUp: 'seenLiked',
  ArrowDown: 'seenDisliked',
}

/** The arrow keys answer while a card is up, outside the fields. */
function useArrowKeys(active: boolean, cast: (vote: Vote) => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select')) return
      const vote = KEYS[event.key]
      if (!vote) return
      event.preventDefault()
      cast(vote)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}

/** The answer a drag of `dx`, `dy` pixels reaches past `line`, if any:
 * along the axis it moved most. */
const swiped = (dx: number, dy: number, line = SWIPE): Vote | null => {
  if (Math.abs(dy) > Math.abs(dx)) {
    if (dy <= -line) return 'seenLiked'
    return dy >= line ? 'seenDisliked' : null
  }
  if (dx >= line) return 'yes'
  return dx <= -line ? 'no' : null
}

/** How far a press may move and still be a tap, in pixels. */
const TAP = 8

const STILL = { x: 0, y: 0 }

/** The card dragged: it follows the finger, gets the sticker of the
 * answer near the line, and answers past it. A tap opens the sheet. */
function useSwipe(cast: (vote: Vote) => void, tap: () => void) {
  const [drag, setDrag] = useState(STILL)
  const start = useRef<{ x: number; y: number } | null>(null)
  const from = (event: PointerEvent) => {
    const at = start.current ?? STILL
    return { x: event.clientX - at.x, y: (event.clientY ?? 0) - at.y }
  }
  const onPointerDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return
    start.current = { x: event.clientX, y: event.clientY ?? 0 }
  }
  const onPointerMove = (event: PointerEvent) => {
    if (start.current === null) return
    const moved = from(event)
    // Once it is a drag, the release may land over the bar on top of the
    // card (a swipe up ends there): the card keeps the pointer until then.
    // A tap keeps no pointer.
    if (Math.hypot(moved.x, moved.y) >= TAP)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    if (!still()) setDrag(moved)
  }
  const onPointerUp = (event: PointerEvent) => {
    if (start.current === null) return
    const { x, y } = from(event)
    start.current = null
    setDrag(STILL)
    const vote = swiped(x, y)
    if (vote) cast(vote)
    else if (Math.hypot(x, y) < TAP) tap()
  }
  const onPointerCancel = () => {
    start.current = null
    setDrag(STILL)
  }
  return {
    drag,
    stamp: swiped(drag.x, drag.y, SWIPE * 0.6),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
}

/** What the form posts: the version, her standing Votos (a standing sim
 * she took out from her Ordem goes as não), the deck's Votos and, from her
 * Ordem, the sins in order (#379). */
function DeckFields({
  version,
  standing,
  undone,
  films,
  votes,
  ranking,
}: {
  version: number
  standing: readonly Film[]
  undone: ReadonlySet<string>
  films: readonly Film[]
  votes: readonly Vote[]
  ranking: readonly Film[]
}) {
  return (
    <>
      <input type="hidden" name="versao" value={version} />
      {standing.map((f) => (
        <input
          key={f.id}
          type="hidden"
          name={f.mine && !undone.has(f.id) ? FIELD[f.mine] : FIELD.no}
          value={f.id}
        />
      ))}
      {votes.map((vote, i) => (
        <input
          key={films[i]?.id}
          type="hidden"
          name={FIELD[vote]}
          value={films[i]?.id}
        />
      ))}
      {ranking.map((f) => (
        <input key={f.id} type="hidden" name="ordem" value={f.id} />
      ))}
    </>
  )
}

/** The deck's films and her Votos on them: on Mudar votos, every film,
 * hers first and already chosen, so she opens on the recap, or on the
 * films still without a Voto (#340); else only the ones without, and her
 * standing Votos go again as they are. */
function deckParts(deck: VoteDeck, revote: boolean) {
  const voted = deck.films.filter((f) => f.mine)
  const unvoted = deck.films.filter((f) => !f.mine)
  return revote
    ? {
        films: [...voted, ...unvoted],
        standing: [],
        kept: voted.flatMap((f) => (f.mine ? [f.mine] : [])),
      }
    : { films: unvoted, standing: voted, kept: [] }
}

/** A card up, and its full sheet when she opens it; the arrow keys vote
 * while the sheet is closed. */
function CardStep({
  film,
  place,
  total,
  people,
  heading,
  cast,
  back,
}: {
  film: Film
  place: number
  total: number
  people: VoteDeck['people']
  heading: RefObject<HTMLHeadingElement | null>
  cast: (vote: Vote) => void
  back: (() => void) | null
}) {
  const [sheet, setSheet] = useState(false)
  useArrowKeys(!sheet, cast)
  const close = () => {
    setSheet(false)
    heading.current?.focus()
  }
  return (
    <>
      <VoteCard
        film={film}
        place={place}
        total={total}
        viewer={people.find((p) => p.owner)?.slug ?? null}
        heading={heading}
        cast={cast}
        back={back}
        open={() => setSheet(true)}
      />
      {sheet && (
        <FilmSheet
          film={{
            title: film.title,
            originalTitle: film.card?.originalTitle ?? null,
            poster: film.card?.poster ?? null,
          }}
          sheet={film.sheet}
          people={people}
          onClose={close}
        >
          <div className="sticky bottom-0 rounded-panel bg-case py-md">
            <VoteButtons
              cast={(vote) => {
                setSheet(false)
                cast(vote)
              }}
            />
          </div>
        </FilmSheet>
      )}
    </>
  )
}

export function VoteCards({
  deck,
  revote = false,
  action,
  onSubmit,
  sending = false,
  header,
}: {
  deck: VoteDeck
  /** Every film of the screen again, not only the ones she has not voted
   * on. */
  revote?: boolean
  action: string
  onSubmit?: FormEventHandler<HTMLFormElement>
  sending?: boolean
  /** What goes above the cards, told the step she is on, so the page's
   * title can say so. */
  header?: (step: Step) => ReactNode
}) {
  const { films, standing, kept } = deckParts(deck, revote)
  const {
    votes,
    said,
    say,
    film,
    heading,
    recap,
    cast,
    back,
    change,
    restart,
  } = useVotes(films, kept)
  const order = useOrder({
    deck,
    films,
    votes,
    standing,
    recap,
    say,
    drop: (i) => change(i, 'no'),
  })
  const step: Step = film ? 'cards' : order.on ? 'ranking' : 'recap'
  return (
    <>
      {header?.(step)}
      <form
        method="post"
        action={action}
        onSubmit={onSubmit}
        aria-busy={sending}
        className="flex flex-col gap-lg"
      >
        <DeckFields
          version={deck.version}
          standing={standing}
          undone={order.undone}
          films={films}
          votes={votes}
          ranking={step === 'ranking' ? order.films : []}
        />
        <p role="status" className="sr-only">
          {sending ? VOTES.sending : said}
        </p>
        {film ? (
          <CardStep
            film={film}
            place={votes.length + 1}
            total={films.length}
            people={deck.people}
            heading={heading}
            cast={cast}
            back={votes.length > 0 ? back : null}
          />
        ) : step === 'ranking' ? (
          <VoteRanking
            films={order.films}
            people={deck.people}
            sending={sending}
            move={order.move}
            drop={order.drop}
            back={order.leave}
          />
        ) : (
          <VoteRecap
            films={films}
            votes={votes}
            sending={sending}
            heading={recap}
            change={change}
            restart={() => {
              order.reset()
              restart()
            }}
            revote={revote}
            rank={order.start}
          />
        )}
      </form>
    </>
  )
}

/** The round buttons under the card, in the gestures' order: ✕ não,
 * 👎 vi e não gostei, ★ vi e gostei, ♥ sim. */
const BUTTONS = [
  {
    vote: 'no',
    label: VOTES.no,
    icon: 'close',
    ring: 'border-sticker-pink text-sticker-pink',
    size: 'size-16',
  },
  {
    vote: 'seenDisliked',
    label: VOTES.seenDisliked,
    icon: 'thumbsDown',
    ring: 'border-case-ink-2 text-case-ink',
    size: 'size-13',
  },
  {
    vote: 'seenLiked',
    label: VOTES.seenLiked,
    icon: 'star',
    ring: 'border-sticker-yellow text-sticker-yellow',
    size: 'size-13',
  },
  {
    vote: 'yes',
    label: VOTES.yes,
    icon: 'heart',
    ring: 'border-sticker-green text-sticker-green',
    size: 'size-16',
  },
] as const

/** The four round buttons, each with its word under it. Before the page
 * hydrates they do nothing, so they wait disabled: a tap then would be
 * lost. */
function VoteButtons({ cast }: { cast: (vote: Vote) => void }) {
  const live = useHydrated()
  return (
    <div className="flex items-end justify-center gap-lg">
      {BUTTONS.map((button) => (
        <button
          key={button.vote}
          type="button"
          disabled={!live}
          onClick={() => cast(button.vote)}
          className="flex cursor-pointer flex-col items-center gap-xs font-display text-control text-case-ink disabled:cursor-default disabled:opacity-60"
        >
          <span
            className={`grid ${button.size} place-items-center rounded-full border-2 bg-case/70 ${button.ring}`}
          >
            <Icon name={button.icon} className="size-7" />
          </span>
          {button.label}
        </button>
      ))}
    </div>
  )
}

/** The poster over the whole card; without one (or when it fails to
 * load), the title big on the case. Decorative: the title is written
 * below it. */
function PosterFill({
  poster,
  title,
}: {
  poster: string | null
  title: string
}) {
  const [broken, setBroken] = useState(false)
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = image.current
    if (img?.complete && img.naturalWidth === 0) setBroken(true)
  }, [])
  return poster && !broken ? (
    <img
      ref={image}
      src={poster.replace('/w342/', '/w780/')}
      alt=""
      onError={() => setBroken(true)}
      draggable={false}
      className="absolute inset-0 size-full object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="absolute inset-x-lg top-[18%] text-center font-display text-page-title text-balance text-case-ink-2"
    >
      {title}
    </span>
  )
}

/** "2012 · 1h44 · IMDb 7,6 · previsto 8,3": the year, the runtime, the
 * IMDb rating and her own Nota prevista. */
function cardFacts(film: Film, viewer: string | null): string[] {
  const { card } = film
  const own = film.sheet?.predictedRatings.find((p) => p.person === viewer)
  return [
    ...(card?.year ? [String(card.year)] : []),
    ...(card?.duration ? [card.duration] : []),
    ...(card?.imdbRating ? [`IMDb ${card.imdbRating}`] : []),
    ...(own ? [VOTES.predicted(own.text)] : []),
  ]
}

/** The sticker a card dragged near each line gets: SIM green, NÃO the
 * pink of TROCAR (a não is one), and the two "vi" the JÁ VI one. */
const STAMPS = {
  yes: { kind: 'yes', text: VOTES.stampYes },
  no: { kind: 'swap', text: VOTES.stampNo },
  seenLiked: { kind: 'seen', text: VOTES.stampSeenLiked },
  seenDisliked: { kind: 'seen', text: VOTES.stampSeenDisliked },
} as const

/** One film over the whole screen, Tinder-like: the poster, and over a
 * translucent band at the bottom its title and facts, the way to its full sheet
 * and the buttons. A tap on the card opens the sheet too. */
function VoteCard({
  film,
  place,
  total,
  viewer,
  heading,
  cast,
  back,
  open,
}: {
  film: Film
  place: number
  total: number
  /** Whoever looks, whose Nota prevista the card shows. */
  viewer: string | null
  heading: RefObject<HTMLHeadingElement | null>
  cast: (vote: Vote) => void
  /** Back to the previous card, from the second on. */
  back: (() => void) | null
  open: () => void
}) {
  const { drag, stamp, handlers } = useSwipe(cast, open)
  const moved = drag.x !== 0 || drag.y !== 0
  return (
    <>
      <article
        aria-labelledby="carta"
        {...handlers}
        style={
          moved
            ? {
                transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x * TURN}deg)`,
              }
            : undefined
        }
        className="fixed inset-0 z-30 flex touch-none flex-col overflow-hidden bg-case text-case-ink select-none"
      >
        <PosterFill poster={film.card?.poster ?? null} title={film.title} />
        <div className="relative mt-auto flex flex-col gap-md bg-case/85 px-lg pt-lg pb-tab-safe">
          {stamp && (
            <Sticker kind={STAMPS[stamp].kind} className="self-start">
              {STAMPS[stamp].text}
            </Sticker>
          )}
          <div className="mx-auto flex w-full max-w-[640px] flex-col gap-md">
            <div className="flex flex-col gap-2xs">
              <div className="flex items-start justify-between gap-md">
                <h2
                  id="carta"
                  ref={heading}
                  tabIndex={-1}
                  className="font-display text-page-title text-balance"
                >
                  {film.title}
                </h2>
                {/* A film that came in after her last Voto (#380). */}
                {film.new && <NewSticker className="mt-xs shrink-0" />}
              </div>
              {film.card?.originalTitle && (
                <p className="text-meta text-case-ink-2">
                  {film.card.originalTitle}
                </p>
              )}
              <p className="text-meta text-case-ink-2 tabular-nums">
                {cardFacts(film, viewer).join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={open}
              className={buttonVariants({
                variant: 'link',
                className: 'min-h-touch self-start text-case-ink',
              })}
            >
              {VOTES.more}
            </button>
            <VoteButtons cast={cast} />
            <p className="text-center text-meta text-case-ink-2">
              <span className="pointer-fine:hidden">{VOTES.hint.touch}</span>
              <span className="hidden pointer-fine:inline">
                {VOTES.hint.keys}
              </span>
            </p>
          </div>
        </div>
      </article>
      {/* Over the card and still while it moves: where she is in the deck,
       * the way back and what a não does. */}
      <div className="fixed inset-x-0 top-0 z-30 flex flex-col gap-xs bg-case/75 px-lg pt-top-safe pb-sm text-meta text-case-ink">
        <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-md">
          <p className="tabular-nums">{VOTES.of(place, total)}</p>
          {back && (
            <button
              type="button"
              onClick={back}
              className={buttonVariants({
                variant: 'link',
                className: 'min-h-touch text-case-ink',
              })}
            >
              {VOTES.back}
            </button>
          )}
        </div>
        <div className="mx-auto w-full max-w-[640px]">
          <VoteRule />
        </div>
      </div>
    </>
  )
}

/** After the last film: the recap, where each film's Não / Sim pair
 * shows her Voto and changes it, and Enviar votos. */
function VoteRecap({
  films,
  votes,
  sending,
  heading,
  change,
  restart,
  revote,
  rank,
}: {
  films: readonly Film[]
  votes: readonly Vote[]
  sending: boolean
  heading: RefObject<HTMLHeadingElement | null>
  change: (i: number, to: Vote) => void
  restart: () => void
  /** Mudar votos: her earlier Votos are the ones chosen. */
  revote: boolean
  /** Leads to her Ordem, with two or more sins; else the recap sends. */
  rank: (() => void) | null
}) {
  const leaving = films
    .filter((_, i) => votes[i] === 'no' || isSeen(votes[i]))
    .map((f) => f.title)
  return (
    <>
      <div className="flex flex-col gap-xs">
        <h2
          ref={heading}
          tabIndex={-1}
          className="font-display text-step-title"
        >
          {VOTES.summary(...tally(votes))}
        </h2>
        <p className="text-meta text-ink-2">
          {revote ? VOTES.kept : VOTES.recap}
        </p>
      </div>
      <ul className="flex flex-col">
        {films.map((f, i) => (
          <RecapRow
            key={f.id}
            title={f.title}
            vote={votes[i] ?? 'yes'}
            sending={sending}
            onChange={(to) => change(i, to)}
          />
        ))}
      </ul>
      {leaving.length > 0 && (
        <p className="font-display font-bold">{VOTES.leaving(leaving)}</p>
      )}
      <div className="flex flex-wrap items-center gap-lg">
        {rank ? (
          <button
            type="button"
            onClick={rank}
            className={buttonVariants()}
            disabled={sending}
          >
            {VOTES.rankStart}
          </button>
        ) : (
          <button type="submit" className={buttonVariants()} disabled={sending}>
            {sending ? VOTES.sending : VOTES.send}
          </button>
        )}
        <button
          type="button"
          onClick={restart}
          disabled={sending}
          className={buttonVariants({ variant: 'link' })}
        >
          {VOTES.restart}
        </button>
      </div>
    </>
  )
}

/** The options of a recap row, in the buttons' order. The two "vi" show
 * a short word; their name is the whole gesture. */
const CHOICES = [
  {
    vote: 'no',
    label: VOTES.no,
    icon: 'close',
    on: 'border-sticker-pink bg-sticker-pink text-on-sticker',
  },
  {
    vote: 'seenDisliked',
    label: VOTES.seenDisliked,
    short: VOTES.recapDisliked,
    icon: 'thumbsDown',
    on: 'border-ink bg-surface text-ink',
  },
  {
    vote: 'seenLiked',
    label: VOTES.seenLiked,
    short: VOTES.recapLiked,
    icon: 'star',
    on: 'border-sticker-yellow bg-sticker-yellow text-on-sticker',
  },
  {
    vote: 'yes',
    label: VOTES.yes,
    icon: 'check',
    on: 'border-sticker-green bg-sticker-green text-on-sticker',
  },
] as const

/** A film of the recap with her answer as a four-way switch: the chosen
 * one is filled in its colour, and a tap on another changes it. On a
 * phone the switch goes under the title. */
function RecapRow({
  title,
  vote,
  sending,
  onChange,
}: {
  title: string
  vote: Vote
  sending: boolean
  onChange: (to: Vote) => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-md gap-y-xs border-b border-rule py-sm last:border-b-0">
      <span className="min-w-0 font-display">{title}</span>
      <div
        role="group"
        aria-label={VOTES.voteOn(title)}
        className="flex shrink-0 rounded-pill border-(length:--border-width-stroke) border-rule bg-surface p-1"
      >
        {CHOICES.map((choice) => {
          const chosen = choice.vote === vote
          return (
            <button
              key={choice.vote}
              type="button"
              aria-pressed={chosen}
              disabled={sending}
              onClick={() => onChange(choice.vote)}
              aria-label={'short' in choice ? choice.label : undefined}
              className={`inline-flex min-h-touch min-w-[56px] cursor-pointer items-center justify-center gap-xs rounded-pill border-2 px-sm font-display text-control disabled:cursor-default disabled:opacity-60 ${chosen ? `${choice.on} font-bold` : 'border-transparent text-ink-2 hover:text-ink'}`}
            >
              <Icon name={choice.icon} className="size-[18px]" />
              {'short' in choice ? choice.short : choice.label}
            </button>
          )
        })}
      </div>
    </li>
  )
}

/** After the Votos went, or with every film voted: the night's list as it
 * is now with her Voto on each, what her não took out, and the next step. */
function VoteResults({
  deck,
  sent,
  links,
  owner,
}: {
  deck: VoteDeck
  sent: boolean
  links: VoteLinks
  /** Who opened the Session, who sees the Perguntas' answers. */
  owner: string | null
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (sent) heading.current?.focus()
  }, [sent])
  const unvoted = deck.films.filter((f) => !f.mine).length
  return (
    <div className="flex flex-col gap-lg">
      <h2 ref={heading} tabIndex={-1} className="font-display text-step-title">
        {VOTES.lineup}
      </h2>
      <LinkFilmList
        films={deck.films}
        left={deck.left}
        arrived={unvoted < deck.films.length}
      />
      {sent && deck.stale && deck.stale.length > 0 && (
        <p className="text-meta text-ink-2">{VOTES.stale(deck.stale)}</p>
      )}
      {unvoted > 0 ? (
        <div className="flex flex-wrap items-center gap-md">
          <a href={links.deck} className={buttonVariants()}>
            {PARTICIPATION.voteNew(unvoted)}
          </a>
          <a
            href={links.revote}
            className={buttonVariants({ variant: 'option' })}
          >
            {VOTES.revote}
          </a>
          {links.questions && (
            <a
              href={links.questions}
              className={buttonVariants({ variant: 'link' })}
            >
              {VOTES.questions}
            </a>
          )}
        </div>
      ) : deck.films.length > 0 ? (
        <VotedActions
          owner={owner}
          questions={links.questions}
          revote={links.revote}
        />
      ) : null}
    </div>
  )
}

/** Where the swipe's page leads. */
type VoteLinks = {
  /** The deck over the films she has not voted on. */
  deck: string
  /** The deck over every film. */
  revote: string
  /** The Perguntas par a par, when some are left for her. */
  questions: string | null
}

type VoteSearch = {
  sessao?: string | undefined
  chave?: string | undefined
  presente?: string | undefined
  feito?: VoteNotice | undefined
  erro?: VoteRefusal | undefined
  mudar?: boolean | undefined
  fora?: string | undefined
}

/** The post of the Votos: `retry` once a write failed that a new try may
 * fix; `lost`, the post that did not reach the server. A failed redo still needs a fresh deck: the server already counted
 * the votes in that case. */
function useVotePost() {
  const [failed, setFailed] = useState(false)
  const {
    onSubmit,
    busy,
    failed: lost,
  } = useFetchForm((to) => {
    const url = new URL(to, window.location.origin)
    const retry =
      url.pathname === '/participar/votar' &&
      url.searchParams.get('erro') === 'indisponivel'
    setFailed(retry)
    return retry
  })
  return { retry: failed, onSubmit, busy, lost }
}

/** What the screen shows: the way back alone after a failure the guest
 * cannot fix, the deck, the night's list, or the way back without a
 * deck. */
function screenOf(
  deck: VoteDeck | null,
  search: VoteSearch,
  failed: boolean,
): 'stuck' | 'vote' | 'results' | 'none' {
  const { feito, erro, mudar = false } = search
  if (!failed && (erro === 'falha' || erro === 'regerar')) return 'stuck'
  if (!deck) return 'none'
  if (mudar || (!feito && deck.films.some((f) => !f.mine))) return 'vote'
  return 'results'
}

/** The screen's title: a failure she cannot fix says what became of her
 * Votos, as the alert under it does. */
function screenTitle(
  screen: ReturnType<typeof screenOf>,
  deck: VoteDeck | null,
  sent: boolean,
  erro: VoteRefusal | undefined,
) {
  if (screen === 'stuck' && (erro === 'falha' || erro === 'regerar'))
    return VOTES.stuck[erro]
  if (screen === 'vote' || !deck) return VOTES.title
  return sent ? VOTES.sent : VOTES.voted
}

/** The way back to the link's film list, when there is a link. */
function BackToList({ home, plain }: { home: string | null; plain: boolean }) {
  if (!home) return null
  return (
    <a
      href={home}
      className={buttonVariants(
        plain
          ? { className: 'self-start' }
          : { variant: 'option', className: 'self-start' },
      )}
    >
      {VOTES.list}
    </a>
  )
}

/** The swipe's page under the chosen Presente's name: what the last post
 * did, and the deck, or the night's list once she voted on every film or
 * just sent her Votos. */
export function VoteScreen({
  deck,
  search,
  home,
  owner = null,
  questions = null,
}: {
  deck: VoteDeck | null
  search: VoteSearch
  /** The link's film list, or null without a link. */
  home: string | null
  /** Who opened the Session, named in what to do after a failure. */
  owner?: string | null
  /** The Perguntas par a par's address, when some are left for her. */
  questions?: string | null
}) {
  const { feito, erro, mudar = false } = search
  const { retry: failed, onSubmit, busy, lost } = useVotePost()
  const refusal = failed ? 'indisponivel' : erro
  const link = {
    sessao: search.sessao,
    chave: search.chave,
    presente: search.presente,
  }
  const screen = screenOf(deck, search, failed)
  const sent = Boolean(feito) && !failed
  const header = (step: Step) => (
    <>
      <h1 id="votar" className="font-display text-page-title text-balance">
        {step === 'recap'
          ? VOTES.review
          : step === 'ranking'
            ? VOTES.rankPage
            : screenTitle(screen, deck, sent, erro)}
      </h1>
      {sent && feito && <Notice>{VOTES.notices[feito]}</Notice>}
      {refusal && <Alert>{VOTES.refusals[refusal](owner)}</Alert>}
      <PostFailed failed={lost} />
    </>
  )
  const voting = screen === 'vote' && deck !== null
  return (
    <section aria-labelledby="votar" className="flex flex-col gap-lg">
      {!voting && header('cards')}
      {screen === 'stuck' && <BackToList home={home} plain />}
      {screen === 'none' && <BackToList home={home} plain={false} />}
      {screen === 'vote' && deck && (
        <VoteCards
          key={`${deck.version}:${deck.films.map((f) => f.id).join(',')}:${mudar}`}
          deck={deck}
          revote={mudar}
          action={votePath('votos', link)}
          onSubmit={onSubmit}
          sending={busy !== null}
          header={header}
        />
      )}
      {screen === 'results' && deck && (
        <VoteResults
          deck={deck}
          sent={sent}
          links={{
            deck: votePath('votar', link),
            revote: votePath('votar', link, { mudar: true }),
            questions,
          }}
          owner={owner}
        />
      )}
    </section>
  )
}
