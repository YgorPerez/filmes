import {
  useEffect,
  useRef,
  useState,
  type FormEventHandler,
  type PointerEvent,
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
import { FilmCover, FilmFacts, LinkFilmRow } from './session-link'
import { PARTICIPATION } from './session-link.copy'
import { VOTES } from './session-votes.copy'

// The group swipe's deck (#182, #275): one film at a time, on its tape
// with its facts, Não or Sim by the buttons, the arrow keys or by dragging
// the card sideways (it follows the finger and gets the SIM or NÃO sticker
// near the line). What a não does is said before the first card. After the
// last film, the recap, where a tap flips a Voto, and Enviar votos, the
// screen's one orange button, which posts every Voto at once. A screen
// reader hears each new card. Her standing Votos on the screen go again
// with the new ones: her latest submission is the one that counts.

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
 * says. After each Voto, the next card's title takes the focus. */
function useVotes(films: readonly Film[]) {
  const [votes, setVotes] = useState<Vote[]>([])
  const [said, setSaid] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)
  const film = films[votes.length]

  useEffect(() => {
    if (!moved.current) return
    if (film) heading.current?.focus()
  }, [film])

  const cast = (vote: Vote) => {
    moved.current = true
    const next = films[votes.length + 1]
    setSaid(next ? VOTES.now(votes.length + 2, films.length, next.title) : '')
    setVotes((v) => [...v, vote].slice(0, films.length))
  }
  const back = () => {
    moved.current = true
    const previous = films[votes.length - 1]
    if (previous) setSaid(VOTES.wentBack(previous.title))
    setVotes((v) => v.slice(0, -1))
  }
  const flip = (i: number) =>
    setVotes((v) => v.map((vote, j) => (j === i ? other(vote) : vote)))
  const restart = () => setVotes([])
  return { votes, said, film, heading, cast, back, flip, restart }
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

/** The card dragged sideways: it follows the finger, gets the SIM or NÃO
 * sticker near the line, and votes past it. */
function useSwipe(cast: (vote: Vote) => void) {
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
}: {
  deck: VoteDeck
  /** Every film of the screen again, not only the ones she has not voted
   * on. */
  revote?: boolean
  action: string
  onSubmit?: FormEventHandler<HTMLFormElement>
  sending?: boolean
}) {
  const films = revote ? deck.films : deck.films.filter((f) => !f.mine)
  const standing = revote ? [] : deck.films.filter((f) => f.mine)
  const { votes, said, film, heading, cast, back, flip, restart } =
    useVotes(films)
  useArrowKeys(film !== undefined, cast)
  return (
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
          <div className="flex flex-col gap-xs">
            <p className="max-w-[60ch] text-pretty">{VOTES.rule}</p>
            <p className="text-meta text-ink-2">{VOTES.hint}</p>
          </div>
          <VoteCard
            film={film}
            place={votes.length + 1}
            total={films.length}
            heading={heading}
            cast={cast}
          />
          {votes.length > 0 && (
            <button
              type="button"
              onClick={back}
              className={buttonVariants({ variant: 'link' })}
            >
              {VOTES.back}
            </button>
          )}
        </>
      ) : (
        <VoteRecap
          films={films}
          votes={votes}
          sending={sending}
          flip={flip}
          restart={restart}
        />
      )}
    </form>
  )
}

/** One film on its tape, with its facts, Não and Sim. */
function VoteCard({
  film,
  place,
  total,
  heading,
  cast,
}: {
  film: Film
  place: number
  total: number
  heading: RefObject<HTMLHeadingElement | null>
  cast: (vote: Vote) => void
}) {
  const { drag, stamp, handlers } = useSwipe(cast)
  return (
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
      className="relative grid touch-pan-y gap-lg rounded-card border border-rule bg-surface p-lg select-none min-[560px]:grid-cols-[200px_1fr]"
    >
      <div className="relative mx-auto w-[60%] max-w-[220px] min-[560px]:w-full">
        <FilmCover
          poster={film.card?.poster ?? null}
          title={film.title}
          eager
          className="w-full"
        />
        {stamp && (
          <Sticker
            kind={stamp === 'yes' ? 'yes' : 'swap'}
            className="absolute top-[40%] left-1/2 -translate-x-1/2"
          >
            {stamp === 'yes' ? VOTES.stampYes : VOTES.stampNo}
          </Sticker>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-md">
        <p className="text-meta text-ink-2 tabular-nums">
          {VOTES.of(place, total)}
        </p>
        <div className="flex flex-col gap-xs">
          <h2
            id="carta"
            ref={heading}
            tabIndex={-1}
            className="font-display text-title text-balance"
          >
            {film.title}
          </h2>
          {film.card?.originalTitle && (
            <p className="text-meta text-ink-2">{film.card.originalTitle}</p>
          )}
        </div>
        <FilmFacts film={film} />
        {film.card?.synopsis && (
          <p className="line-clamp-3 max-w-[60ch] text-synopsis text-pretty">
            {film.card.synopsis}
          </p>
        )}
        <div className="mt-auto grid grid-cols-2 gap-sm">
          <button
            type="button"
            onClick={() => cast('no')}
            className={buttonVariants({
              variant: 'option',
              className: 'border-2 border-sticker-pink',
            })}
          >
            <Icon name="close" className="size-[18px]" />
            {VOTES.no}
          </button>
          <button
            type="button"
            onClick={() => cast('yes')}
            className={buttonVariants({
              variant: 'option',
              className: 'border-2 border-sticker-green',
            })}
          >
            <Icon name="check" className="size-[18px]" />
            {VOTES.yes}
          </button>
        </div>
      </div>
    </article>
  )
}

/** After the last film: the recap, where a tap flips a Voto, and Enviar
 * votos. */
function VoteRecap({
  films,
  votes,
  sending,
  flip,
  restart,
}: {
  films: readonly Film[]
  votes: readonly Vote[]
  sending: boolean
  flip: (i: number) => void
  restart: () => void
}) {
  const yes = votes.filter((v) => v === 'yes').length
  const leaving = films.filter((_, i) => votes[i] === 'no').map((f) => f.title)
  return (
    <>
      <div className="flex flex-col gap-xs">
        <h2 className="font-display text-step-title">
          {VOTES.summary(yes, votes.length - yes)}
        </h2>
        <p className="text-meta text-ink-2">{VOTES.recap}</p>
      </div>
      <ul className="flex flex-col gap-xs">
        {films.map((f, i) => (
          <RecapRow
            key={f.id}
            title={f.title}
            vote={votes[i] ?? 'yes'}
            sending={sending}
            onFlip={() => flip(i)}
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

/** A film of the recap, with its Voto to flip. */
function RecapRow({
  title,
  vote,
  sending,
  onFlip,
}: {
  title: string
  vote: Vote
  sending: boolean
  onFlip: () => void
}) {
  const yes = vote === 'yes'
  return (
    <li className="flex items-center justify-between gap-md border-b border-rule py-xs last:border-b-0">
      <span className="min-w-0 font-display">{title}</span>
      <button
        type="button"
        onClick={onFlip}
        disabled={sending}
        aria-label={VOTES.flip(title, vote)}
        className={buttonVariants({
          variant: 'option',
          className: `min-w-[96px] border-2 ${yes ? 'border-sticker-green' : 'border-sticker-pink'}`,
        })}
      >
        <Icon name={yes ? 'check' : 'close'} className="size-[18px]" />
        {yes ? VOTES.yes : VOTES.no}
      </button>
    </li>
  )
}

const other = (vote: Vote): Vote => (vote === 'yes' ? 'no' : 'yes')

/** After the Votos went, or with every film voted: the night's list as it
 * is now with her Voto on each, what her não took out, and the next step. */
function VoteResults({
  deck,
  sent,
  links,
}: {
  deck: VoteDeck
  sent: boolean
  links: VoteLinks
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
      <ol className="rounded-card border border-rule bg-surface px-md">
        {deck.films.map((film, i) => (
          <LinkFilmRow key={film.id} film={film} first={i === 0} />
        ))}
      </ol>
      {deck.left.length > 0 && (
        <p className="text-meta text-ink-2">
          {`${PARTICIPATION.left}: ${deck.left.join(', ')}.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-md">
        {unvoted > 0 ? (
          <a href={links.deck} className={buttonVariants()}>
            {PARTICIPATION.voteNew(unvoted)}
          </a>
        ) : links.questions ? (
          <a href={links.questions} className={buttonVariants()}>
            {VOTES.questions}
          </a>
        ) : null}
        {deck.films.length > 0 && (
          <a
            href={links.revote}
            className={buttonVariants({ variant: 'option' })}
          >
            {VOTES.revote}
          </a>
        )}
        {unvoted > 0 && links.questions && (
          <a
            href={links.questions}
            className={buttonVariants({ variant: 'link' })}
          >
            {VOTES.questions}
          </a>
        )}
      </div>
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

/** The screen's title. */
function screenTitle(
  screen: ReturnType<typeof screenOf>,
  deck: VoteDeck | null,
  sent: boolean,
) {
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
  return (
    <section aria-labelledby="votar" className="flex flex-col gap-lg">
      <h1 id="votar" className="font-display text-title">
        {screenTitle(screen, deck, sent)}
      </h1>
      {sent && feito && <Notice>{VOTES.notices[feito]}</Notice>}
      {refusal && <Alert>{VOTES.refusals[refusal](owner)}</Alert>}
      <PostFailed failed={lost} />
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
        />
      )}
    </section>
  )
}
