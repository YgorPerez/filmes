import { useEffect, useRef, useState } from 'react'
import {
  isReplyRefusal,
  type ReplyRefusal,
  type SessionNotice,
} from '#/content/billboard-reply'
import {
  feedbackPath,
  sessionPath,
  SESSIONS_PATH,
  PENDING_FEEDBACK_PATH,
} from '#/content/session-paths'
import type { CartazPage } from '#/platform/billboard'
import type { PageReading } from '#/platform/reading'
import type { SessionItem } from '#/platform/sessions'
import { Billboard } from './billboard'
import { forgetMarks, openStorage } from './billboard-marks'
import { useFetchForm } from './kit/fetch-form'
import { RowArrow } from './kit/row-arrow'
import { Slip } from './kit/slip'
import { buttonVariants } from './kit/button-variants'
import { Alert, PostFailed } from './kit/status'
import { names } from './session-names'
import { Avatars, SessionDate, NewSessionLink } from './session-parts'
import { ChosenReactions } from './billboard-chosen'
import { Icon } from './kit/icon'
import { PairwiseAnswers } from './pairwise-answers'
import { ShareSessionLink } from './session-link-share'
import { SESSIONS, spoken } from './sessions.copy'

/** "Contar como foi": the Session's Feedback form. */
function FeedbackLink({ session }: { session: string }) {
  return (
    <a
      href={feedbackPath(session)}
      className={buttonVariants({ variant: 'option', className: 'self-start' })}
    >
      {SESSIONS.list.feedback}
    </a>
  )
}

/** What a closed Session ended with. */
const outcome = (s: SessionItem) =>
  s.chosen ? SESSIONS.list.chosen(s.chosen.title) : SESSIONS.list.nothing

/** An open Session's shelf by title (#272): what the night was, at a
 * glance; the first three and how many more. */
const shelfOf = (s: SessionItem) => {
  const titles = s.recommendation.map((film) => film.title)
  if (titles.length === 0) return SESSIONS.films(0)
  return SESSIONS.list.shelf(titles.slice(0, 3), titles.length - 3)
}

function SessionRow({ session: s }: { session: SessionItem }) {
  const context = [...s.moods, ...s.constraints].join(', ')
  return (
    <li>
      <Slip
        as="article"
        head={
          <a
            href={sessionPath(s.id)}
            className="flex min-h-touch items-center gap-lg text-ink no-underline hover:underline"
          >
            <Avatars people={s.attendees} />
            <span className="flex min-w-0 flex-1 flex-col gap-2xs">
              <span className="font-display text-step-title">
                {names(s.attendees)}
              </span>
              <span className="text-meta text-ink-2">
                <SessionDate date={s.date} />
              </span>
            </span>
            <RowArrow />
          </a>
        }
      >
        <div className="flex flex-col gap-sm">
          <div className="min-w-0">
            <p className="font-medium text-pretty">
              {s.open ? shelfOf(s) : outcome(s)}
            </p>
            {s.request && (
              <p className="mt-2xs text-ink-2 wrap-anywhere">{s.request}</p>
            )}
            {s.open && context && (
              <p className="mt-2xs text-meta text-ink-2">{context}</p>
            )}
          </div>
          {s.open && (
            <div className="flex justify-end">
              <FeedbackLink session={s.id} />
            </div>
          )}
        </div>
      </Slip>
    </li>
  )
}

/** No Session, or none to tell (#272): what a Session is and the way to
 * one, or what goes here once a film was seen. */
function EmptyList({ pendingOnly }: { pendingOnly: boolean }) {
  const { list } = SESSIONS
  return (
    <section className="flex flex-col items-start gap-md">
      <h2 className="font-display text-title">
        {pendingOnly ? list.pendingEmpty : list.empty}
      </h2>
      <p className="max-w-[60ch] text-ink-2">
        {pendingOnly ? list.pendingEmptyLead : list.emptyLead}
      </p>
      {!pendingOnly && <NewSessionLink>{list.emptyAction}</NewSessionLink>}
    </section>
  )
}

/** The history or the Sessions still waiting for Feedback. */
export function SessionList({
  sessions,
  pendingOnly = false,
}: {
  sessions: SessionItem[] | null
  pendingOnly?: boolean
}) {
  const { list } = SESSIONS
  const filters = [
    { href: SESSIONS_PATH, label: list.all, current: !pendingOnly },
    { href: PENDING_FEEDBACK_PATH, label: list.pending, current: pendingOnly },
  ]
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-2xl py-3xl">
      <header className="flex flex-wrap items-center justify-between gap-lg">
        <h1 className="font-display text-counter-title">{list.title}</h1>
        <NewSessionLink>{list.create}</NewSessionLink>
      </header>
      <nav
        aria-label={list.filters}
        className="flex flex-wrap gap-sm border-b border-rule pb-xl"
      >
        {filters.map(({ href, label, current }) => (
          <a
            key={href}
            href={href}
            aria-current={current ? 'page' : undefined}
            className={buttonVariants({
              variant: 'option',
              className:
                'aria-[current=page]:border-2 aria-[current=page]:border-ink aria-[current=page]:bg-surface-2',
            })}
          >
            {label}
          </a>
        ))}
      </nav>
      {sessions === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : sessions.length === 0 ? (
        <EmptyList pendingOnly={pendingOnly} />
      ) : (
        <ul
          aria-label={pendingOnly ? list.pending : list.title}
          className="flex flex-col gap-md"
        >
          {sessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </ul>
      )}
    </main>
  )
}

/** `/sessoes/<id>`: the Session and its Cartaz (Já vi, Trocar, stars,
 * comments, acrescentar; Enviar posts to `/sessoes/<id>/responder`). `page`
 * is `'unknown'` when there is no Session by that id, null when the engine
 * cannot run on this server; `notice` and `refusal` are what the form or
 * the last reply said, and `words` the acrescentar's words the reading did
 * not take. No Voltar: the Sessões tab is the way back (#272). */
export function SessionScreen({
  page,
  notice,
  refusal,
  words,
}: {
  page: CartazPage | 'unknown' | null
  notice?: SessionNotice
  refusal?: ReplyRefusal
  words?: readonly string[]
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-2xl px-2xl pt-xl pb-3xl">
      {page === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <UnknownSession />
      ) : (
        <SessionView
          key={page.session.id}
          page={page}
          notice={notice}
          refusal={refusal}
          words={words}
        />
      )}
    </main>
  )
}

/** No Session by that id: what it is, and the two ways on (#272). */
function UnknownSession() {
  const { session } = SESSIONS
  return (
    <section className="flex flex-col gap-lg">
      <h1 className="font-display text-counter-title">{session.unknown}</h1>
      <p className="text-ink-2">{session.unknownLead}</p>
      <div className="flex flex-wrap gap-sm">
        <a
          href={SESSIONS_PATH}
          className={buttonVariants({ variant: 'option' })}
        >
          {session.toList}
        </a>
        <NewSessionLink>{session.toNew}</NewSessionLink>
      </div>
    </section>
  )
}

/** The page's head in one line (#272): the day, who was there, and the
 * ⋯ menu with the Link para os Presentes and "Contar como foi". */
function SessionHead({ page }: { page: CartazPage }) {
  const s = page.session
  const menu = s.open
  return (
    <header className="flex items-start justify-between gap-md">
      <div className="flex min-w-0 flex-col gap-2xs">
        <h1 className="font-display text-counter-title">
          <SessionDate date={s.date} />
        </h1>
        <p className="flex min-w-0 items-center gap-sm text-meta text-ink-2">
          <Avatars people={s.attendees} />
          <span className="min-w-0 truncate">{names(s.attendees)}</span>
        </p>
      </div>
      {menu && (
        <details className="relative shrink-0">
          <summary
            aria-label={SESSIONS.session.menu}
            className="grid size-touch cursor-pointer list-none place-items-center rounded-round border-(length:--border-width-stroke) border-rule bg-surface font-display text-title leading-none text-ink [&::-webkit-details-marker]:hidden"
          >
            <span aria-hidden="true">⋯</span>
          </summary>
          <div className="absolute top-full right-0 z-20 mt-xs flex w-max max-w-[calc(100vw-32px)] flex-col gap-sm rounded-card border border-rule bg-surface p-lg">
            <FeedbackLink session={s.id} />
            {page.sessionLink && (
              <ShareSessionLink key={s.id} url={page.sessionLink} />
            )}
          </div>
        </details>
      )}
    </header>
  )
}

/** What the acrescentar became, in one sentence (#272): what went into
 * the request, what stayed only as a note, and what to say next time. */
function readingText(
  addition: string,
  reading: PageReading,
  owner?: string,
): string {
  const { session } = SESSIONS
  const understood = reading.understood.map((label) => spoken(label, owner))
  return [
    understood.length > 0
      ? session.understood(understood)
      : session.additionRead(addition),
    reading.notUnderstood.length > 0 &&
      session.additionNotUnderstood(reading.notUnderstood),
    ...reading.ambiguities.map((a) =>
      session.additionAmbiguous(
        a.words,
        a.candidates.map((c) => c.label),
      ),
    ),
    session.additionTaste,
  ]
    .filter(Boolean)
    .join(' ')
}

/** What the last reply or the form left to say, as quiet lines: the
 * warnings, and the acrescentar, which is gosto only after the Dono's
 * yes. */
function Said({ page }: { page: CartazPage }) {
  const { session } = SESSIONS
  const owner = page.billboard?.attendees.find((p) => p.owner)?.name
  return (
    <>
      {page.warnings.length > 0 && (
        <div
          role="status"
          className="flex flex-col gap-xs rounded-field border border-rule bg-surface-2 px-3 py-2.5"
        >
          <span className="font-semibold">{session.warnings}</span>
          <ul className="list-disc pl-5 text-meta">
            {page.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {page.addition && (
        <p role="status" className="text-meta text-pretty text-ink-2">
          {page.reading
            ? readingText(page.addition, page.reading, owner)
            : session.addition(page.addition)}{' '}
          <a href="/pessoas" className="font-semibold text-ink">
            {session.additionLink}
          </a>
        </p>
      )}
    </>
  )
}

/** The notices the page still says in words: the rest show on the
 * Cartaz itself (a new Session, a redo, a told one). */
const SPOKEN_NOTICES: ReadonlySet<SessionNotice> = new Set<SessionNotice>([
  'anotada',
  'perguntas-gravadas',
  'perguntas-descartadas',
])

/** A told Session opens with the tape given back (#272): the film they
 * saw and how each one took it, who the group weighs more next time, and
 * the same group again. */
function TapeReturned({ page }: { page: CartazPage }) {
  const { session } = SESSIONS
  const s = page.session
  const billboard = page.billboard
  const card = billboard?.films.find((film) => film.reactions)
  const reactions = card?.reactions ?? billboard?.chosen?.reactions ?? []
  const title = s.chosen?.title
  const again = `/sessoes/nova?${new URLSearchParams({
    presentes: s.attendees.map((a) => a.person).join(','),
  }).toString()}`
  return (
    <section
      aria-labelledby="fita-devolvida"
      className="flex flex-col gap-lg rounded-card border-2 border-ink bg-surface p-xl"
    >
      <h2
        id="fita-devolvida"
        className="font-display text-label text-ink-2 uppercase"
      >
        {session.returned}
      </h2>
      {title ? (
        <p className="font-display text-title">{title}</p>
      ) : (
        <p className="font-display text-title">{session.returnedNothing}</p>
      )}
      {billboard && reactions.length > 0 && (
        <ChosenReactions
          reactions={reactions}
          people={billboard.attendees}
          bare
        />
      )}
      {page.satisfaction && page.satisfaction.length > 0 && (
        <div className="flex flex-col gap-xs text-meta text-ink-2">
          <p>{session.satisfaction}</p>
          <ul className="list-disc pl-5">
            {page.satisfaction.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      <a
        href={again}
        className={buttonVariants({
          variant: 'option',
          className: 'self-start',
        })}
      >
        {session.again}
      </a>
    </section>
  )
}

function SessionView({
  page,
  notice,
  refusal,
  words,
}: {
  page: CartazPage
  notice?: SessionNotice
  refusal?: ReplyRefusal
  words?: readonly string[]
}) {
  const { session } = SESSIONS
  const s = page.session
  const billboard = page.billboard
  const [sentReplies, setSentReplies] = useState(0)
  const [editing, setEditing] = useState(false)
  const [rejection, setRejection] = useState<{
    reason: ReplyRefusal
    words: readonly string[]
  } | null>(null)

  const { onSubmit, busy, failed } = useFetchForm((to) => {
    const url = new URL(to, window.location.origin)
    if (
      url.origin !== window.location.origin ||
      url.pathname !== sessionPath(s.id)
    )
      return false
    const reason = url.searchParams.get('erro')
    if (isReplyRefusal(reason)) {
      setEditing(false)
      setRejection({ reason, words: url.searchParams.getAll('palavra') })
      return true
    }
    setRejection(null)
    const done = url.searchParams.get('feito')
    if (!billboard || (done !== 'regerada' && done !== 'anotada')) return false
    // The marks go once the new Cartaz is in: kept if it fails to load.
    return () => {
      forgetMarks(openStorage(), billboard)
      setSentReplies((n) => n + 1)
    }
  })
  const refused = rejection?.reason ?? refusal
  const unreadWords = rejection ? rejection.words : (words ?? [])
  // The words the reading did not take are asked in the bar, not alerted.
  const asking = refused === 'leitura' && unreadWords.length > 0
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if ((rejection && !asking) || failed)
      alert.current?.scrollIntoView({ block: 'nearest' })
  }, [rejection, failed, asking])
  const edit = () => {
    setEditing(true)
    const field = document.getElementById('acrescentar')
    field?.scrollIntoView({ block: 'center' })
    field?.focus()
  }
  const closed = !s.open
  // Told, the shelf folds without the film they saw: the tape above has it.
  const chosenId = billboard?.films.find((film) => film.reactions)?.id
  const shelf =
    closed && billboard !== null
      ? {
          ...billboard,
          films: billboard.films.filter((film) => film.id !== chosenId),
          sections: billboard.sections
            .map((section) => ({
              ...section,
              films: section.films.filter((id) => id !== chosenId),
            }))
            .filter((section) => section.films.length > 0),
          chosen: undefined,
        }
      : billboard
  const others = shelf?.films.length ?? 0
  const cartaz =
    shelf === null ? (
      <Alert>{SESSIONS.unavailable}</Alert>
    ) : (
      <Billboard
        key={`${shelf.version}:${sentReplies}`}
        billboard={shelf}
        action={`${sessionPath(s.id)}/responder`}
        post={{ onSubmit, busy: busy !== null, sending: busy === '' }}
        sent={
          sentReplies === 0 && (notice === 'regerada' || notice === 'anotada')
        }
        unread={
          asking && !editing ? { words: unreadWords, onEdit: edit } : undefined
        }
        after={
          s.open && (
            <p className="flex flex-wrap items-center gap-sm text-ink-2">
              {session.seenIt} <FeedbackLink session={s.id} />
            </p>
          )
        }
      />
    )

  return (
    <>
      <SessionHead page={page} />
      {notice && SPOKEN_NOTICES.has(notice) && (
        <p role="status" className="text-meta text-ink-2">
          {session.notices[notice]}
        </p>
      )}
      {((refused && !asking) || failed) && (
        <div ref={alert}>
          {refused && !asking && <Alert>{session.refusals[refused]}</Alert>}
          <PostFailed failed={failed} />
        </div>
      )}
      <Said page={page} />
      <PairwiseAnswers
        action={`${sessionPath(s.id)}/perguntas`}
        waiting={page.pairwise ?? []}
        post={{ onSubmit, busy }}
      />
      {closed && <TapeReturned page={page} />}
      {closed && billboard !== null ? (
        <details className="group/shelf flex flex-col">
          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-sm font-display text-row-title [&::-webkit-details-marker]:hidden">
            {s.chosen ? session.others(others) : session.shelf}
            <Icon
              name="plus"
              className="size-[18px] text-ink-2 transition-transform group-open/shelf:rotate-45 motion-reduce:transition-none"
            />
          </summary>
          <div className="pt-lg">{cartaz}</div>
        </details>
      ) : (
        cartaz
      )}
    </>
  )
}
