import {
  useRef,
  useState,
  type FormEventHandler,
  type PointerEvent,
} from 'react'
import {
  votePath,
  type VoteNotice,
  type VoteRefusal,
} from '#/content/session-votes-address'
import type { VoteDeck } from '#/platform/session-votes'
import { buttonVariants } from './kit/button-variants'
import { useFetchForm } from './kit/fetch-form'
import { Alert, Notice, PostFailed } from './kit/status'
import { VOTES } from './session-votes.copy'

// The group swipe's deck (#182): one film at a time, Não or Sim, by the
// buttons or by dragging the card sideways; after the last film, the
// summary and Enviar votos, the screen's one orange button, which posts
// every Voto at once. Voltar undoes the last one before sending.

type Vote = 'yes' | 'no'

/** How far the card must be dragged to count as a Voto, in pixels. */
const SWIPE = 60

export function VoteCards({
  deck,
  action,
  onSubmit,
  sending = false,
}: {
  deck: VoteDeck
  action: string
  onSubmit?: FormEventHandler<HTMLFormElement>
  sending?: boolean
}) {
  const [votes, setVotes] = useState<Vote[]>([])
  const start = useRef<number | null>(null)
  const { films } = deck
  const film = films[votes.length]
  const cast = (vote: Vote) =>
    setVotes((v) => [...v, vote].slice(0, films.length))
  const yes = votes.filter((v) => v === 'yes').length

  const onPointerDown = (event: PointerEvent) => {
    start.current = event.clientX
  }
  const onPointerUp = (event: PointerEvent) => {
    if (start.current === null) return
    const moved = event.clientX - start.current
    start.current = null
    if (moved >= SWIPE) cast('yes')
    else if (moved <= -SWIPE) cast('no')
  }

  return (
    <form
      method="post"
      action={action}
      onSubmit={onSubmit}
      className="flex flex-col gap-lg"
    >
      <input type="hidden" name="versao" value={deck.version} />
      {votes.map((vote, i) => (
        <input
          key={films[i]?.id}
          type="hidden"
          name={vote === 'yes' ? 'sim' : 'nao'}
          value={films[i]?.id}
        />
      ))}
      {film ? (
        <>
          <p className="text-meta">{VOTES.hint}</p>
          <article
            aria-label={VOTES.of(votes.length + 1, films.length)}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              start.current = null
            }}
            className="flex min-h-[220px] touch-pan-y flex-col justify-between gap-lg rounded-card border border-rule bg-surface px-3.5 pt-lg pb-3.5 select-none"
          >
            <p className="text-meta">
              {VOTES.of(votes.length + 1, films.length)}
            </p>
            <h2 className="font-display text-title">{film.title}</h2>
            <div className="grid grid-cols-2 gap-sm">
              <button
                type="button"
                onClick={() => cast('no')}
                className={buttonVariants({ variant: 'option' })}
              >
                {VOTES.no}
              </button>
              <button
                type="button"
                onClick={() => cast('yes')}
                className={buttonVariants({ variant: 'option' })}
              >
                {VOTES.yes}
              </button>
            </div>
          </article>
          {votes.length > 0 && (
            <button
              type="button"
              onClick={() => setVotes((v) => v.slice(0, -1))}
              className={buttonVariants({ variant: 'link' })}
            >
              {VOTES.back}
            </button>
          )}
        </>
      ) : (
        <>
          <p className="font-display text-step-title">
            {VOTES.summary(yes, votes.length - yes)}
          </p>
          <p className="text-meta">{VOTES.rule}</p>
          <div className="flex flex-wrap items-center gap-lg">
            <button
              type="submit"
              className={buttonVariants()}
              disabled={sending}
            >
              {sending ? VOTES.sending : VOTES.send}
            </button>
            <button
              type="button"
              onClick={() => setVotes([])}
              disabled={sending}
              className={buttonVariants({ variant: 'link' })}
            >
              {VOTES.restart}
            </button>
          </div>
        </>
      )}
    </form>
  )
}

/** The swipe's page under the chosen Presente's name: what the last post
 * did, and the deck, or that she voted on every film of the screen. */
export function VoteScreen({
  deck,
  search,
  home,
}: {
  deck: VoteDeck | null
  search: {
    sessao?: string | undefined
    chave?: string | undefined
    presente?: string | undefined
    feito?: VoteNotice | undefined
    erro?: VoteRefusal | undefined
  }
  /** The link's film list, or null without a link. */
  home: string | null
}) {
  const { feito, erro } = search
  const [failed, setFailed] = useState(false)
  const {
    onSubmit,
    busy,
    failed: lost,
  } = useFetchForm((to) => {
    const url = new URL(to, window.location.origin)
    // A failed write can be retried. A failed redo still needs a fresh deck:
    // the server already counted the votes in that case.
    const retry =
      url.pathname === '/participar/votar' &&
      url.searchParams.get('erro') === 'indisponivel'
    setFailed(retry)
    return retry
  })
  const refusal = failed ? 'indisponivel' : erro
  return (
    <section aria-labelledby="votar" className="flex flex-col gap-lg">
      <h1 id="votar" className="font-display text-title">
        {VOTES.title}
      </h1>
      {feito && !failed && <Notice>{VOTES.notices[feito]}</Notice>}
      {refusal && <Alert>{VOTES.refusals[refusal]}</Alert>}
      <PostFailed failed={lost} />
      {deck && deck.films.length > 0 ? (
        <VoteCards
          key={`${deck.version}:${deck.films.map((f) => f.id).join(',')}`}
          deck={deck}
          action={votePath('votos', search)}
          onSubmit={onSubmit}
          sending={busy !== null}
        />
      ) : (
        <>
          <p>{VOTES.done}</p>
          <div className="flex flex-wrap gap-sm">
            <a
              href={votePath('votar', search)}
              className={buttonVariants({ variant: 'option' })}
            >
              {VOTES.refresh}
            </a>
            {home && (
              <a href={home} className={buttonVariants({ variant: 'option' })}>
                {VOTES.list}
              </a>
            )}
          </div>
        </>
      )}
    </section>
  )
}
