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
import { useFetchForm } from './kit/fetch-form'
import { Icon } from './kit/icon'
import { Alert, Notice, PostFailed } from './kit/status'
import { Sticker } from './kit/sticker'
import { FilmSheet } from './film-sheet'
import { LinkFilmList, VotedActions, VoteRule } from './session-link'
import { PARTICIPATION } from './session-link.copy'
import { VOTES } from './session-votes.copy'

// The group swipe's deck (#182, #275, #377): one film at a time over the
// whole screen, Tinder-like: the poster, and on a translucent band at the
// bottom (DESIGN.md has no gradients) the title, the facts and her own
// Nota prevista. Não or Sim by the round buttons, the
// arrow keys or by dragging the card sideways (it follows the finger and
// gets the SIM or NÃO sticker near the line). A tap on the card opens its
// full sheet (`film-sheet.tsx`), where she can vote too. What a não does
// stays over the card. After the last film, the recap, where a tap flips a
// Voto, and Enviar votos, the screen's one orange button, which posts
// every Voto at once. A screen reader hears each new card. Her standing
// Votos on the screen go again with the new ones: her latest submission is
// the one that counts.

type Vote = 'yes' | 'no'

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
    const cast = [...votes, vote]
    const yes = cast.filter((v) => v === 'yes').length
    setSaid(
      next
        ? VOTES.now(votes.length + 2, films.length, next.title)
        : VOTES.end(yes, cast.length - yes),
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
  return { votes, said, film, heading, recap, cast, back, change, restart }
}

/** The arrow keys vote while a card is up, outside the fields. */
function useArrowKeys(active: boolean, cast: (vote: Vote) => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select')) return
      if (event.key === 'ArrowLeft') cast('no')
      else if (event.key === 'ArrowRight') cast('yes')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
}

/** The Voto a drag of `dx` pixels reaches past `line`, if any. */
const swiped = (dx: number, line = SWIPE): Vote | null => {
  if (dx >= line) return 'yes'
  return dx <= -line ? 'no' : null
}

/** How far a press may move and still be a tap, in pixels. */
const TAP = 8

/** The card dragged sideways: it follows the finger, gets the SIM or NÃO
 * sticker near the line, and votes past it. A tap opens the sheet. */
function useSwipe(cast: (vote: Vote) => void, tap: () => void) {
  const [drag, setDrag] = useState(0)
  const start = useRef<number | null>(null)
  const onPointerDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement).closest('button')) return
    start.current = event.clientX
  }
  const onPointerMove = (event: PointerEvent) => {
    if (start.current === null || still()) return
    setDrag(event.clientX - start.current)
  }
  const onPointerUp = (event: PointerEvent) => {
    if (start.current === null) return
    const dx = event.clientX - start.current
    start.current = null
    setDrag(0)
    const vote = swiped(dx)
    if (vote) cast(vote)
    else if (Math.abs(dx) < TAP) tap()
  }
  const onPointerCancel = () => {
    start.current = null
    setDrag(0)
  }
  return {
    drag,
    stamp: swiped(drag, SWIPE * 0.6),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  }
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
  /** What goes above the cards, told whether she is on the recap, so the
   * page's title can say so. */
  header?: (reviewing: boolean) => ReactNode
}) {
  const voted = deck.films.filter((f) => f.mine)
  const unvoted = deck.films.filter((f) => !f.mine)
  // Mudar votos: every film, hers first and already chosen, so she opens
  // on the recap, or on the films still without a Voto (#340).
  const films = revote ? [...voted, ...unvoted] : unvoted
  const standing = revote ? [] : voted
  const kept = revote ? voted.flatMap((f) => (f.mine ? [f.mine] : [])) : []
  const { votes, said, film, heading, recap, cast, back, change, restart } =
    useVotes(films, kept)
  const [sheet, setSheet] = useState(false)
  useArrowKeys(film !== undefined && !sheet, cast)
  const reviewing = film === undefined
  const viewer = deck.people.find((p) => p.owner)?.slug ?? null
  const close = () => {
    setSheet(false)
    heading.current?.focus()
  }
  return (
    <>
      {header?.(reviewing)}
      <form
        method="post"
        action={action}
        onSubmit={onSubmit}
        aria-busy={sending}
        className="flex flex-col gap-lg"
      >
        <input type="hidden" name="versao" value={deck.version} />
        {standing.map((f) => (
          <input
            key={f.id}
            type="hidden"
            name={f.mine === 'yes' ? 'sim' : 'nao'}
            value={f.id}
          />
        ))}
        {votes.map((vote, i) => (
          <input
            key={films[i]?.id}
            type="hidden"
            name={vote === 'yes' ? 'sim' : 'nao'}
            value={films[i]?.id}
          />
        ))}
        <p role="status" className="sr-only">
          {sending ? VOTES.sending : said}
        </p>
        {film ? (
          <>
            <VoteCard
              film={film}
              place={votes.length + 1}
              total={films.length}
              viewer={viewer}
              heading={heading}
              cast={cast}
              back={votes.length > 0 ? back : null}
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
                people={deck.people}
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
        ) : (
          <VoteRecap
            films={films}
            votes={votes}
            sending={sending}
            heading={recap}
            change={change}
            restart={restart}
            revote={revote}
          />
        )}
      </form>
    </>
  )
}

/** The round buttons under the card, in the gestures' order: ✕ não,
 * 👎 vi e não gostei, ★ vi e gostei, ♥ sim. The two "vi" ones are drawn
 * but hidden until their Votos exist (#378). */
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

/** What the buttons cast: a Voto, or a "vi" still without one. */
type Gesture = (typeof BUTTONS)[number]['vote']

const isVote = (gesture: Gesture): gesture is Vote =>
  gesture === 'yes' || gesture === 'no'

/** The four round buttons, each with its word under it. */
function VoteButtons({ cast }: { cast: (vote: Vote) => void }) {
  return (
    <div className="flex items-end justify-center gap-lg">
      {BUTTONS.map((button) => (
        <button
          key={button.vote}
          type="button"
          hidden={!isVote(button.vote)}
          onClick={() => {
            if (isVote(button.vote)) cast(button.vote)
          }}
          className="flex cursor-pointer flex-col items-center gap-xs font-display text-control text-case-ink"
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
  return (
    <>
      <article
        aria-labelledby="carta"
        {...handlers}
        style={
          drag === 0
            ? undefined
            : {
                transform: `translateX(${drag}px) rotate(${drag * TURN}deg)`,
              }
        }
        className="fixed inset-0 z-30 flex touch-pan-y flex-col overflow-hidden bg-case text-case-ink select-none"
      >
        <PosterFill poster={film.card?.poster ?? null} title={film.title} />
        <div className="relative mt-auto flex flex-col gap-md bg-case/85 px-lg pt-lg pb-tab-safe">
          {stamp && (
            <Sticker
              kind={stamp === 'yes' ? 'yes' : 'swap'}
              className="self-start"
            >
              {stamp === 'yes' ? VOTES.stampYes : VOTES.stampNo}
            </Sticker>
          )}
          <div className="mx-auto flex w-full max-w-[640px] flex-col gap-md">
            <div className="flex flex-col gap-2xs">
              <h2
                id="carta"
                ref={heading}
                tabIndex={-1}
                className="font-display text-page-title text-balance"
              >
                {film.title}
              </h2>
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
}: {
  films: readonly Film[]
  votes: readonly Vote[]
  sending: boolean
  heading: RefObject<HTMLHeadingElement | null>
  change: (i: number, to: Vote) => void
  restart: () => void
  /** Mudar votos: her earlier Votos are the ones chosen. */
  revote: boolean
}) {
  const yes = votes.filter((v) => v === 'yes').length
  const leaving = films.filter((_, i) => votes[i] === 'no').map((f) => f.title)
  return (
    <>
      <div className="flex flex-col gap-xs">
        <h2
          ref={heading}
          tabIndex={-1}
          className="font-display text-step-title"
        >
          {VOTES.summary(yes, votes.length - yes)}
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
        <button type="submit" className={buttonVariants()} disabled={sending}>
          {sending ? VOTES.sending : VOTES.send}
        </button>
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

/** The options of a recap row, Não first as on the card. */
const CHOICES = [
  {
    vote: 'no',
    label: VOTES.no,
    icon: 'close',
    on: 'border-sticker-pink bg-sticker-pink',
  },
  {
    vote: 'yes',
    label: VOTES.yes,
    icon: 'check',
    on: 'border-sticker-green bg-sticker-green',
  },
] as const

/** A film of the recap with her Voto as a two-way switch: the chosen side
 * is filled in its sticker colour, and a tap on the other changes it. */
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
    <li className="flex items-center justify-between gap-md border-b border-rule py-sm last:border-b-0">
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
              className={`inline-flex min-h-touch min-w-[72px] cursor-pointer items-center justify-center gap-xs rounded-pill border-2 px-sm font-display text-control disabled:cursor-default disabled:opacity-60 ${chosen ? `${choice.on} text-on-sticker font-bold` : 'border-transparent text-ink-2 hover:text-ink'}`}
            >
              <Icon name={choice.icon} className="size-[18px]" />
              {choice.label}
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
  const header = (reviewing: boolean) => (
    <>
      <h1 id="votar" className="font-display text-page-title text-balance">
        {reviewing ? VOTES.review : screenTitle(screen, deck, sent, erro)}
      </h1>
      {sent && feito && <Notice>{VOTES.notices[feito]}</Notice>}
      {refusal && <Alert>{VOTES.refusals[refusal](owner)}</Alert>}
      <PostFailed failed={lost} />
    </>
  )
  const voting = screen === 'vote' && deck !== null
  return (
    <section aria-labelledby="votar" className="flex flex-col gap-lg">
      {!voting && header(false)}
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
