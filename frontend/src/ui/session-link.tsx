import { useEffect, useRef, useState } from 'react'
import type { LinkPerson, SessionLinkView } from '#/platform/session-link'
import { weekdayDate } from './dates'
import { buttonVariants } from './kit/button-variants'
import { Chip } from './kit/chip'
import { Icon } from './kit/icon'
import { Avatar } from './kit/person'
import { ShelfLabel } from './kit/shelf-label'
import { TapeCase } from './kit/tape-case'
import { PARTICIPATION } from './session-link.copy'
import { VOTES } from './session-votes.copy'

// The Presente's side of the Link da Sessão (#180, #275): the first screen
// anyone outside the house sees. It lives in the same Locadora as the
// Dono's Cartaz: each film on its tape, the night's request on the shelf
// label, each Presente in her colour with her initial. No Evidence, Fato or
// Nota prevista reaches it.

type Film = SessionLinkView['films'][number]

/** The first letter or digit of a title, for a tape too small for it. */
const initialOf = (title: string) =>
  /[\p{L}\p{N}]/u.exec(title)?.[0]?.toLocaleUpperCase('pt-BR') ?? ''

/** A film's tape: the poster or, without one (or when it fails to load),
 * the title on the cover (the Cartaz's rule; a `small` tape, too narrow
 * for it, gets the title's initial). The poster is decorative: the title
 * is always written beside it. */
export function FilmCover({
  poster,
  title,
  eager = false,
  small = false,
  className = '',
}: {
  poster: string | null
  title: string
  eager?: boolean
  small?: boolean
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  const image = useRef<HTMLImageElement>(null)
  // A poster that failed before hydration fired no onError React saw.
  useEffect(() => {
    const img = image.current
    if (img?.complete && img.naturalWidth === 0) setBroken(true)
  }, [])
  return (
    <TapeCase
      className={className}
      cover={
        poster && !broken ? (
          <img
            ref={image}
            src={poster}
            alt=""
            loading={eager ? 'eager' : 'lazy'}
            onError={() => setBroken(true)}
            className="absolute inset-0 size-full object-cover"
          />
        ) : small ? (
          <span aria-hidden="true" className="text-title">
            {initialOf(title)}
          </span>
        ) : (
          <span aria-hidden="true">{title}</span>
        )
      }
    />
  )
}

/** "2021 · 1h44 · Drama": the chips of a film's card. */
export function FilmFacts({ film }: { film: Film }) {
  const { card } = film
  if (!card) return null
  const chips = [
    ...(card.year ? [String(card.year)] : []),
    ...(card.duration ? [card.duration] : []),
    ...card.genres.slice(0, 2),
  ]
  return (
    <p className="flex flex-wrap gap-xs">
      {chips.map((chip) => (
        <Chip key={chip}>{chip}</Chip>
      ))}
      {card.imdbRating && <Chip>{`IMDb ${card.imdbRating}`}</Chip>}
    </p>
  )
}

/** The link that leads nowhere: a broken or foreign link, or a Session
 * that already closed (with the film the night ended with), each with
 * what to do next. */
export function LinkUnavailable({
  closed,
}: {
  /** Null for a broken link; for a closed Session, the chosen film's
   * title, or null when the Feedback named none. */
  closed: { chosen: string | null } | 'deleted' | null
}) {
  const { unavailable } = PARTICIPATION
  return (
    <div className="flex flex-col gap-sm">
      <h1 className="font-display text-page-title text-balance">
        {closed === 'deleted'
          ? unavailable.deleted
          : closed
            ? unavailable.closed
            : unavailable.broken}
      </h1>
      <p className="max-w-[60ch] text-pretty text-ink-2">
        {closed === 'deleted'
          ? unavailable.deletedLead
          : closed
            ? unavailable.closedLead(closed.chosen)
            : unavailable.brokenLead}
      </p>
    </div>
  )
}

/** The link's first screen: who sent it and for when, the Presentes in
 * their colours, and "Quem é você?" with each guest's name. The Dono who
 * opened the Session votes on her own Cartaz, so her name is left out
 * (a guest could take it by mistake, with no login); only a Session with
 * no one else lists her, marked. */
export function LinkPicker({
  view,
  hrefFor,
  unknown = false,
}: {
  view: SessionLinkView
  /** Where a name leads: the page the link asked for, as that Presente. */
  hrefFor: (person: string) => string
  /** The link named a Presente who is not in the Session. */
  unknown?: boolean
}) {
  const guests = view.attendees.filter((person) => !person.owner)
  const names = guests.length > 0 ? guests : view.attendees
  return (
    <div className="flex flex-col gap-xl">
      <p className="text-ink-2">
        {PARTICIPATION.invited(view.owner, weekdayDate(view.date))}
      </p>
      <h1 className="font-display text-page-title text-balance">
        {PARTICIPATION.pick}
      </h1>
      {unknown && (
        <p className="text-ink" role="status">
          {PARTICIPATION.unknownPerson}
        </p>
      )}
      <ul className="flex flex-col gap-sm">
        {names.map((person) => (
          <li key={person.person}>
            <a
              href={hrefFor(person.person)}
              className={buttonVariants({
                variant: 'option',
                className: 'min-h-[56px] w-full justify-start gap-md',
              })}
            >
              <span aria-hidden="true">
                <Avatar person={person} />
              </span>
              {person.name}
              {person.owner && (
                <span className="font-body text-meta text-ink-2">
                  {` · ${PARTICIPATION.opened}`}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
      <p className="max-w-[60ch] text-meta text-ink-2">
        {PARTICIPATION.noLogin}
      </p>
    </div>
  )
}

/** Above every page once a Presente is chosen: her colour and name, at
 * body weight so the page's title leads, and the way back to the names. */
export function LinkHeader({
  person,
  notYou,
}: {
  person: LinkPerson
  notYou: string
}) {
  return (
    <header className="flex flex-wrap items-center gap-sm border-b border-rule pb-md">
      <span aria-hidden="true">
        <Avatar person={person} />
      </span>
      <p>
        {`${PARTICIPATION.as} `}
        <strong className="font-display">{person.name}</strong>
      </p>
      <a
        href={notYou}
        className={buttonVariants({
          variant: 'link',
          className: 'ml-auto min-h-touch',
        })}
      >
        {PARTICIPATION.notYou}
      </a>
    </header>
  )
}

/** The veto rule, with Não and Sim in bold behind a filled dot of the
 * buttons' colour and glyph, so "Não tira o filme" reads as the button,
 * not as a negation. The dot is a shape the buttons never take: an
 * outlined pill here read as a button to tap (pass 4 F2). */
export function VoteRule() {
  const { rule } = VOTES
  const term = (kind: 'no' | 'yes') => (
    <span className="inline-flex items-baseline gap-1 font-bold whitespace-nowrap">
      <span
        aria-hidden="true"
        className={`inline-flex size-[18px] shrink-0 items-center justify-center self-center rounded-full text-on-sticker ${kind === 'no' ? 'bg-sticker-pink' : 'bg-sticker-green'}`}
      >
        <Icon
          name={kind === 'no' ? 'close' : 'check'}
          className="size-[12px]"
        />
      </span>
      {kind === 'no' ? rule.no : rule.yes}
    </span>
  )
  return (
    <p className="max-w-[60ch] text-pretty">
      {term('no')} {rule.noDoes} {term('yes')} {rule.yesDoes}
    </p>
  )
}

/** One row of the night's list. `arrived` marks a film she has not voted
 * on while she voted the rest: it came in after her Votos. */
export function LinkFilmRow({
  film,
  first,
  arrived = false,
}: {
  film: Film
  first: boolean
  arrived?: boolean
}) {
  return (
    <li className="grid grid-cols-[64px_1fr] items-start gap-md border-b border-rule py-md last:border-b-0">
      <div className="relative">
        <FilmCover
          poster={film.card?.poster ?? null}
          title={film.title}
          eager={first}
          small
          className="w-full"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-xs">
        <p className="font-display text-row-title text-balance">
          <span className="text-ink-2 tabular-nums">{`${film.position}. `}</span>
          {film.title}
        </p>
        <FilmFacts film={film} />
        {film.mine ? (
          <p className="text-meta text-ink-2">
            {PARTICIPATION.mine(film.mine)}
          </p>
        ) : (
          arrived && (
            <p className="text-meta font-bold text-ink">
              {PARTICIPATION.arrived}
            </p>
          )
        )}
      </div>
    </li>
  )
}

/** The chosen Presente's home on the link: the night's shelf label, the
 * films in order with their tapes, Votar as the one orange button (or the
 * way back to her Votos), and the questions in a quiet block after. */
export function LinkFilms({
  view,
  vote,
  questions,
}: {
  view: SessionLinkView
  /** The deck's address; `revote` is the deck over every film. */
  vote: { deck: string; revote: string }
  /** The Perguntas par a par's address. */
  questions: string
}) {
  const { films } = view
  const unvoted = films.filter((f) => f.mine === null).length
  const done = films.length > 0 && unvoted === 0
  return (
    <section
      aria-labelledby="filmes-da-sessao"
      className="flex flex-col gap-lg"
    >
      <ShelfLabel items={[weekdayDate(view.date), ...view.shelf]} />
      <div className="flex flex-col gap-xs">
        <h1
          id="filmes-da-sessao"
          className="font-display text-page-title text-balance"
        >
          {PARTICIPATION.films}
        </h1>
        {films.length > 0 && (
          <p className="max-w-[60ch] text-pretty text-ink-2">
            {PARTICIPATION.lead(films.length)}
          </p>
        )}
      </div>
      {films.length === 0 ? (
        <p>{PARTICIPATION.empty}</p>
      ) : (
        <>
          <ol
            aria-labelledby="filmes-da-sessao"
            className="rounded-card border border-rule bg-surface px-md"
          >
            {films.map((film, i) => (
              <LinkFilmRow
                key={film.id}
                film={film}
                first={i === 0}
                arrived={unvoted < films.length}
              />
            ))}
          </ol>
          {view.left.length > 0 && (
            <p className="text-meta text-ink-2">
              {`${PARTICIPATION.left}: ${view.left.join(', ')}.`}
            </p>
          )}
          {done ? (
            <div className="flex flex-col gap-sm">
              <p className="font-display font-bold">{PARTICIPATION.voted}</p>
              <VotedActions
                owner={view.owner}
                questions={view.questions > 0 ? questions : null}
                revote={vote.revote}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-sm">
              <VoteRule />
              <div className="flex flex-wrap items-center gap-md">
                <a href={vote.deck} className={buttonVariants()}>
                  {unvoted === films.length
                    ? PARTICIPATION.vote
                    : PARTICIPATION.voteNew(unvoted)}
                </a>
                {unvoted < films.length && (
                  <a
                    href={vote.revote}
                    className={buttonVariants({ variant: 'option' })}
                  >
                    {VOTES.revote}
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {!done && view.questions > 0 && (
        <QuestionsInvite owner={view.owner} href={questions} />
      )}
    </section>
  )
}

/** With every film voted, on the film list and on the deck's page alike
 * (pass 5 F2): the Perguntas par a par as the orange button, when some are
 * left, with who sees the answers, then Mudar votos. */
export function VotedActions({
  owner,
  questions,
  revote,
}: {
  owner: string | null
  /** The Perguntas par a par's address, when some are left for her. */
  questions: string | null
  /** The deck over every film. */
  revote: string
}) {
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex flex-wrap items-center gap-md">
        {questions && (
          <a href={questions} className={buttonVariants()}>
            {VOTES.questions}
          </a>
        )}
        <a href={revote} className={buttonVariants({ variant: 'option' })}>
          {VOTES.revote}
        </a>
      </div>
      {questions && (
        <p className="max-w-[60ch] text-meta text-pretty text-ink-2">
          {PARTICIPATION.questionsLead(owner)}
        </p>
      )}
    </div>
  )
}

/** The quiet way to the Perguntas par a par, after the films. */
function QuestionsInvite({
  owner,
  href,
}: {
  owner: string | null
  href: string
}) {
  return (
    <aside className="flex flex-col gap-xs rounded-card border border-dashed border-rule p-lg">
      <h2 className="font-display text-step-title-small">
        {PARTICIPATION.questionsTitle}
      </h2>
      <p className="max-w-[60ch] text-pretty text-ink-2">
        {PARTICIPATION.questionsLead(owner)}
      </p>
      <a href={href} className={buttonVariants({ variant: 'link' })}>
        {VOTES.questions}
      </a>
    </aside>
  )
}
