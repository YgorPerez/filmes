import type { ReactNode } from 'react'
import {
  RATING_CHOICES,
  REPORT_CHOICES,
  type FeedbackRefusal,
} from '#/content/feedback-form'
import type {
  FeedbackAttendee,
  FeedbackPage,
  FeedbackSession,
} from '#/platform/feedback'
import { FEEDBACK } from './feedback.copy'
import { Marquee } from './marquee'
import {
  Alert,
  Items,
  Item,
  Meta,
  Notice,
  OwnerTag,
  Section,
  TextField,
} from './person-parts'
import { Button, buttonVariants } from './shadcn/button'

function Page({ back, children }: { back: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <a href={back} className={buttonVariants({ variant: 'quiet' })}>
          {FEEDBACK.back}
        </a>
      </header>
      {children}
    </main>
  )
}

const names = (attendees: readonly FeedbackAttendee[]) =>
  attendees.map((a) => a.name).join(', ')

/** `/feedback`: the open Sessions, each a link to its form. `sessions` is
 * null when the engine cannot run on this server; `recorded` is the Session
 * whose Feedback was just recorded. */
export function OpenSessions({
  sessions,
  recorded,
  gone = false,
}: {
  sessions: FeedbackSession[] | null
  recorded?: string
  gone?: boolean
}) {
  const { list } = FEEDBACK
  return (
    <Page back="/">
      <div className="flex flex-col gap-sm">
        <h1 className="text-title">{list.title}</h1>
        <p className="text-ink-2">{list.lead}</p>
      </div>
      {recorded && <Notice>{list.recorded(recorded)}</Notice>}
      {gone && <Alert>{list.gone}</Alert>}
      {!sessions ? (
        <Alert>{FEEDBACK.unavailable}</Alert>
      ) : sessions.length === 0 ? (
        <p className="text-ink-2">{list.empty}</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-rule bg-surface">
          {sessions.map((s) => (
            <li key={s.id} className="border-rule not-first:border-t">
              <a
                href={`/feedback/${encodeURIComponent(s.id)}`}
                className="flex min-h-touch items-center gap-sm px-md py-sm text-ink no-underline"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-semibold">
                    {s.date} · {names(s.attendees)}
                  </span>
                  <Meta
                    parts={[s.request, list.films(s.recommendation.length)]}
                  />
                </span>
                <span aria-hidden="true" className="text-ink-2">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}

/** `/feedback/<sessao>`: the form that records the Session's Feedback and
 * closes it, and the Crédito of its Presentes now. A plain POST to
 * `/feedback/<sessao>/enviar`: it works before the JavaScript. `page` is
 * `'unknown'` when no open Session has that id, null when the engine cannot
 * run on this server. */
export function FeedbackScreen({
  session,
  page,
  refusal,
}: {
  session: string
  page: FeedbackPage | 'unknown' | null
  refusal?: FeedbackRefusal
}) {
  return (
    <Page back="/feedback">
      {page === null ? (
        <Alert>{FEEDBACK.unavailable}</Alert>
      ) : page === 'unknown' ? (
        <Alert>{FEEDBACK.form.unknown}</Alert>
      ) : (
        <>
          <div className="flex flex-col gap-xs">
            <h1 className="text-title">{FEEDBACK.form.title}</h1>
            <Meta parts={[page.date, names(page.attendees), page.request]} />
          </div>
          {refusal && <Alert>{FEEDBACK.refusals[refusal]}</Alert>}
          <FeedbackForm session={session} page={page} />
          {page.attendees.length > 1 && <Credit page={page} />}
        </>
      )}
    </Page>
  )
}

const choice =
  'flex min-h-touch cursor-pointer items-center gap-sm rounded-field border border-rule px-3 py-2 has-checked:border-ink has-checked:bg-surface-2'

function FeedbackForm({
  session,
  page,
}: {
  session: string
  page: FeedbackPage
}) {
  const { form } = FEEDBACK
  return (
    <form
      method="post"
      action={`/feedback/${encodeURIComponent(session)}/enviar`}
      aria-label={form.label}
      className="flex flex-col gap-xl"
    >
      <fieldset className="flex flex-col gap-sm rounded-card border border-rule bg-surface p-md">
        <legend className="px-xs text-title">{form.film}</legend>
        {page.recommendation.map((film) => (
          <label key={film.id} className={choice}>
            <input type="radio" name="filme" value={film.id} />
            <span>
              <span className="font-letter text-letter">{film.position}</span>{' '}
              {film.title}
            </span>
          </label>
        ))}
        <label className={choice}>
          <input type="radio" name="filme" value="outro" />
          <span>{form.other}</span>
        </label>
        <TextField
          name="busca"
          label={form.search}
          hint={form.searchHint}
          placeholder="tt…"
        />
        <label className={choice}>
          <input type="radio" name="filme" value="nada" />
          <span>
            {form.nothing}{' '}
            <span className="text-meta text-ink-2">{form.nothingHint}</span>
          </span>
        </label>
      </fieldset>

      <Section id="reacoes" title={form.reactions} lead={form.reactionsLead}>
        {page.attendees.map((attendee) => (
          <Reaction key={attendee.person} attendee={attendee} />
        ))}
      </Section>

      <Button type="submit" className="self-start">
        {form.submit}
      </Button>
    </form>
  )
}

function Reaction({ attendee }: { attendee: FeedbackAttendee }) {
  const { form } = FEEDBACK
  const id = `reacao-${attendee.person}`
  return (
    <fieldset className="flex flex-col gap-sm border-rule pt-sm not-first:border-t">
      <legend className="flex items-center gap-sm font-semibold">
        {attendee.name}
        {attendee.owner && <OwnerTag />}
      </legend>
      <label htmlFor={id} className="sr-only">
        {`${form.reaction}: ${attendee.name}`}
      </label>
      <select
        id={id}
        name={`reacao.${attendee.person}`}
        defaultValue=""
        className="min-h-touch w-full rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink"
      >
        <option value="">{form.none}</option>
        <optgroup label={form.ratings}>
          {RATING_CHOICES.map((value) => (
            <option key={value} value={`nota:${value}`}>
              {form.rating(value)}
            </option>
          ))}
        </optgroup>
        {!attendee.owner && (
          <optgroup label={form.reports}>
            {Object.entries(REPORT_CHOICES).map(([value, label]) => (
              <option key={value} value={`relato:${value}`}>
                {label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <TextField
        name={`comentario.${attendee.person}`}
        label={`${form.comment}: ${attendee.name}`}
        hint={form.commentHint}
      />
    </fieldset>
  )
}

function Credit({ page }: { page: FeedbackPage }) {
  const { credit } = FEEDBACK
  return (
    <Section id="credito" title={credit.title} lead={credit.lead}>
      <Items empty={credit.empty}>
        {page.credit
          .filter((c) => c.line !== null)
          .map((c) => (
            <Item key={c.person}>
              <span className="font-semibold">{c.name}</span>
              <span>{c.line}</span>
              <Meta parts={[credit.value(c.value)]} />
            </Item>
          ))}
      </Items>
    </Section>
  )
}
