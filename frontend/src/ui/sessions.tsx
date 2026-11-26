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
import { ImportsFrame } from './imports'
import { RowArrow } from './kit/row-arrow'
import { Slip } from './kit/slip'
import { buttonVariants } from './kit/button-variants'
import { Alert, Notice } from './kit/status'
import { names } from './session-names'
import { Avatars, SessionDate, NewSessionLink } from './session-parts'
import { PairwiseAnswers } from './pairwise-answers'
import { ShareSessionLink } from './session-link-share'
import { SESSIONS } from './sessions.copy'

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
        <div className="flex flex-wrap items-center justify-between gap-x-2xl gap-y-sm">
          <div className="min-w-0">
            <p className="font-medium">
              {s.open ? SESSIONS.films(s.recommendation.length) : outcome(s)}
            </p>
            {s.request && (
              <p className="mt-2xs text-ink-2 wrap-anywhere">{s.request}</p>
            )}
            {s.open && context && (
              <p className="mt-2xs text-meta text-ink-2">{context}</p>
            )}
          </div>
          {s.open && <FeedbackLink session={s.id} />}
        </div>
      </Slip>
    </li>
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
        <p className="text-ink-2">
          {pendingOnly ? list.pendingEmpty : list.empty}
        </p>
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
 * the last reply said. */
export function SessionScreen({
  page,
  notice,
  refusal,
}: {
  page: CartazPage | 'unknown' | null
  notice?: SessionNotice
  refusal?: ReplyRefusal
}) {
  return (
    <ImportsFrame back={SESSIONS.back} backTo="/sessoes">
      {page === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <Alert>{SESSIONS.session.unknown}</Alert>
      ) : (
        <SessionView
          key={page.session.id}
          page={page}
          notice={notice}
          refusal={refusal}
        />
      )}
    </ImportsFrame>
  )
}

const labels = (candidates: readonly { label: string }[]) =>
  candidates.map((c) => c.label)

/** The acrescentar, what went into the request from it, and what did
 * not. */
function readingText(addition: string, reading: PageReading): string {
  const { session } = SESSIONS
  return [
    session.additionRead(addition),
    reading.understood.length > 0 && session.additionAdded(reading.understood),
    reading.notUnderstood.length > 0 &&
      session.additionNotUnderstood(reading.notUnderstood),
    ...reading.ambiguities.map((a) =>
      session.additionAmbiguous(a.words, labels(a.candidates)),
    ),
    session.additionTaste,
  ]
    .filter(Boolean)
    .join(' ')
}

/** What the last reply or the form left to say: the warnings, and the
 * acrescentar, which is gosto only after the Dono's yes. */
function Said({ page }: { page: CartazPage }) {
  const { session } = SESSIONS
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
        <Notice>
          {page.reading
            ? readingText(page.addition, page.reading)
            : session.addition(page.addition)}{' '}
          <a href="/pessoas" className="font-semibold text-ink">
            {session.additionLink}
          </a>
        </Notice>
      )}
    </>
  )
}

function SessionView({
  page,
  notice,
  refusal,
}: {
  page: CartazPage
  notice?: SessionNotice
  refusal?: ReplyRefusal
}) {
  const { session } = SESSIONS
  const s = page.session
  const billboard = page.billboard
  const [sentReplies, setSentReplies] = useState(0)
  const [rejection, setRejection] = useState<{ reason: ReplyRefusal } | null>(
    null,
  )
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (rejection) alert.current?.scrollIntoView({ block: 'nearest' })
  }, [rejection])

  const { onSubmit, busy } = useFetchForm((to) => {
    const url = new URL(to, window.location.origin)
    if (
      url.origin !== window.location.origin ||
      url.pathname !== sessionPath(s.id)
    )
      return false
    const reason = url.searchParams.get('erro')
    if (isReplyRefusal(reason)) {
      setRejection({ reason })
      return true
    }
    setRejection(null)
    const done = url.searchParams.get('feito')
    if (billboard && (done === 'regerada' || done === 'anotada')) {
      forgetMarks(openStorage(), billboard)
      setSentReplies((n) => n + 1)
    }
    return false
  })
  const refused = rejection?.reason ?? refusal
  return (
    <>
      <header className="flex flex-col gap-xl border-b border-dashed border-rule pb-xl">
        <div className="flex flex-wrap items-start justify-between gap-lg">
          <div className="flex min-w-0 flex-col gap-sm">
            <h1 className="font-display text-counter-title">
              {session.title} <SessionDate date={s.date} />
            </h1>
            <div className="flex min-w-0 items-center gap-sm">
              <Avatars people={s.attendees} />
              <span className="text-ink-2">{names(s.attendees)}</span>
            </div>
          </div>
          {s.open && <FeedbackLink session={s.id} />}
        </div>
        {!s.open && (
          <p className="text-ink-2">
            <span className="font-semibold text-ink">{session.closed}.</span>{' '}
            {outcome(s)}.
          </p>
        )}
        {page.sessionLink && (
          <ShareSessionLink key={s.id} url={page.sessionLink} />
        )}
      </header>
      {notice && <Notice>{session.notices[notice]}</Notice>}
      {refused && (
        <div ref={alert}>
          <Alert>{session.refusals[refused]}</Alert>
        </div>
      )}
      <Said page={page} />
      <PairwiseAnswers
        action={`${sessionPath(s.id)}/perguntas`}
        waiting={page.pairwise ?? []}
        post={{ onSubmit, busy }}
      />
      {billboard === null ? (
        <Alert>{SESSIONS.unavailable}</Alert>
      ) : (
        <Billboard
          key={`${billboard.version}:${sentReplies}`}
          billboard={billboard}
          action={`${sessionPath(s.id)}/responder`}
          post={{ onSubmit, busy: busy !== null, sending: busy === '' }}
          sent={
            sentReplies === 0 && (notice === 'regerada' || notice === 'anotada')
          }
        />
      )}
    </>
  )
}
