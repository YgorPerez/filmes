import { FIELD } from './kit/field'
import { createContext, useContext, type ReactNode } from 'react'
import type { QueueNotice, QueueRefusal } from '#/content/import-action'
import { MY_TASTE } from '#/content/paths'
import type { QueueEntry, QueuePage, QueueSuggestion } from '#/platform/imports'
import { ImportsFrame } from './imports'
import { QUEUE } from './imports.copy'
import { useFetchForm } from './kit/fetch-form'
import { FieldLabel } from './kit/field-label'
import { usePostedFeedback } from './kit/posted-feedback'
import { PageHead } from './kit/page-head'
import { TapeCase } from './kit/tape-case'
import { Alert, Notice, Submit, TextField } from './person-parts'
import { Button, buttonVariants } from './shadcn/button'

/** What the last decision did. */
export type QueueDoneView = {
  notice: QueueNotice
  resolved?: number
  left?: number
}

/** What the screen does with a form's answer (`usePostedFeedback`). */
const Answered = createContext<
  ((to: string, form: HTMLFormElement) => boolean) | undefined
>(undefined)

/** A form of the queue: a POST to `/fila/acao`, by `fetch` once the
 * JavaScript is in (#240). `children` see whether its post is running. */
function QueueForm({
  action,
  id,
  label,
  className = 'flex flex-col gap-xl',
  children,
}: {
  action: 'confirmar' | 'descartar' | 'reprocessar'
  id?: string
  label?: string
  className?: string
  children: (busy: boolean) => ReactNode
}) {
  const { onSubmit, busy } = useFetchForm(useContext(Answered))
  return (
    <form
      method="post"
      action="/fila/acao"
      aria-label={label}
      onSubmit={onSubmit}
      className={className}
    >
      <input type="hidden" name="acao" value={action} />
      {id !== undefined && <input type="hidden" name="id" value={id} />}
      {children(busy !== null)}
    </form>
  )
}

/** The resolution queue (`QUEUE_PATH`): the films of the Letterboxd imports that wait for the Dono, one
 * card each, with TMDB's suggestions and the forms to confirm or discard;
 * and asking TMDB again. `queue` is null when the engine cannot run here. */
export function QueueScreen({
  queue,
  done,
  refusal,
}: {
  queue: QueuePage | null
  done?: QueueDoneView
  refusal?: QueueRefusal
}) {
  const { feedback, onAnswer } = usePostedFeedback(
    done ? `${done.notice}:${done.resolved}:${done.left}` : (refusal ?? ''),
  )
  return (
    <Answered.Provider value={onAnswer}>
      <ImportsFrame back={QUEUE.back} backTo={`${MY_TASTE}/importar`}>
        <PageHead title={QUEUE.title} lead={QUEUE.lead} />
        {(refusal || done) && (
          <div ref={feedback}>
            {refusal && <Alert>{QUEUE.refusals[refusal]}</Alert>}
            {done && (
              <Notice>
                {QUEUE.notices[done.notice](done.resolved, done.left)}
              </Notice>
            )}
          </div>
        )}
        {!queue ? (
          <Alert>{QUEUE.unavailable}</Alert>
        ) : (
          <>
            {queue.items.length === 0 ? (
              <p className="text-ink-2">{QUEUE.empty}</p>
            ) : (
              <ul className="flex flex-col gap-2xl">
                {queue.items.map((item) => (
                  <Card key={item.id} item={item} names={queue.names} />
                ))}
              </ul>
            )}
            {queue.items.length > 0 && (
              <datalist id="motivos">
                {QUEUE.reasons.map((reason) => (
                  <option key={reason} value={reason} />
                ))}
              </datalist>
            )}
            <QueueForm
              action="reprocessar"
              label={QUEUE.reprocess}
              className="flex flex-col gap-md border-t border-dashed border-rule pt-2xl"
            >
              {(busy) => (
                <>
                  <p className="max-w-[60ch] text-meta text-ink-2">
                    {QUEUE.reprocessLead}
                  </p>
                  <Submit disabled={busy}>
                    {busy ? QUEUE.busy.reprocess : QUEUE.reprocess}
                  </Submit>
                </>
              )}
            </QueueForm>
            {queue.attributions.map(({ source, text }) => (
              <p key={source} className="text-source text-ink-2">
                {text}
              </p>
            ))}
          </>
        )}
      </ImportsFrame>
    </Answered.Provider>
  )
}

/** The film the import could not place: a tape with no label yet. */
function BlankTape() {
  return (
    <div aria-hidden="true" className="w-16 sm:w-20">
      <TapeCase
        cover={
          <span className="font-display text-[26px] leading-none font-extrabold">
            ?
          </span>
        }
      />
    </div>
  )
}

function Card({
  item,
  names,
}: {
  item: QueueEntry
  names: Record<string, string>
}) {
  const title = QUEUE.item(item.name, item.year)
  const headingId = `fila-${item.id}`
  return (
    <li>
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-xl rounded-card border border-rule bg-surface px-xl pt-2xl pb-xl"
      >
        <div className="flex items-start gap-xl">
          <BlankTape />
          <div className="flex min-w-0 flex-col gap-xs">
            <h2 id={headingId} className="font-display text-title">
              {title}
            </h2>
            <p className="text-meta text-ink-2">{item.reason}</p>
            <p className="text-meta">
              {QUEUE.of} {item.people.map((p) => names[p] ?? p).join(', ')}
            </p>
          </div>
        </div>
        {item.candidates.length > 0 && <Suggestions item={item} />}
        <Confirm id={item.id} title={title} />
        <Discard id={item.id} title={title} />
      </section>
    </li>
  )
}

/** TMDB's films with the title, each confirmed with one click. */
function Suggestions({ item }: { item: QueueEntry }) {
  return (
    <div className="flex flex-col gap-xs border-t border-dashed border-rule pt-lg">
      <h3 className="font-display text-label text-ink-2 uppercase">
        {QUEUE.candidates}
      </h3>
      <ul className="flex flex-col">
        {item.candidates.map((candidate) => (
          <Suggestion key={candidate.tmdb} id={item.id} candidate={candidate} />
        ))}
      </ul>
    </div>
  )
}

function Suggestion({
  id,
  candidate,
}: {
  id: string
  candidate: QueueSuggestion
}) {
  const label = QUEUE.item(candidate.title, candidate.year)
  return (
    <li className="flex items-center justify-between gap-sm border-rule py-sm not-first:border-t">
      <span className="flex min-w-0 flex-col gap-2xs">
        <a
          href={candidate.link}
          rel="noreferrer"
          target="_blank"
          className="font-display text-[15px] font-bold text-ink underline decoration-rule underline-offset-3 hover:decoration-ink"
        >
          {label}
        </a>
        {candidate.originalTitle && (
          <span className="text-meta text-ink-2">
            {candidate.originalTitle}
          </span>
        )}
      </span>
      <QueueForm action="confirmar" id={id} className="shrink-0">
        {(busy) => (
          <>
            <input type="hidden" name="filme" value={candidate.link} />
            <Button
              type="submit"
              variant="option"
              disabled={busy}
              aria-label={QUEUE.pickLabel(label, candidate.tmdb)}
            >
              {busy ? QUEUE.busy.confirm : QUEUE.pick}
            </Button>
          </>
        )}
      </QueueForm>
    </li>
  )
}

/** The film the Dono names: a tconst, an IMDb or a TMDB link. */
function Confirm({ id, title }: { id: string; title: string }) {
  return (
    <QueueForm
      action="confirmar"
      id={id}
      label={`${QUEUE.confirm} ${title}`}
      className="flex flex-col gap-sm border-t border-dashed border-rule pt-lg sm:flex-row sm:items-end"
    >
      {(busy) => (
        <>
          <div className="min-w-0 flex-1">
            <TextField
              name="filme"
              label={QUEUE.film}
              hint={QUEUE.filmHint}
              required
            />
          </div>
          <Submit disabled={busy}>
            {busy ? QUEUE.busy.confirm : QUEUE.confirm}
          </Submit>
        </>
      )}
    </QueueForm>
  )
}

/** Out of the queue, with a reason (the page's datalist suggests some). */
function Discard({ id, title }: { id: string; title: string }) {
  return (
    <details className="group">
      <summary
        className={buttonVariants({
          variant: 'link',
          className: 'list-none [&::-webkit-details-marker]:hidden',
        })}
      >
        {QUEUE.discardOpen}
      </summary>
      <QueueForm
        action="descartar"
        id={id}
        label={`${QUEUE.discard} ${title}`}
        className="mt-xs flex flex-col gap-sm rounded-field bg-surface-2 p-lg sm:flex-row sm:items-end"
      >
        {(busy) => (
          <>
            <div className="min-w-0 flex-1">
              <FieldLabel label={QUEUE.reason} hint={QUEUE.reasonHint}>
                <input
                  type="text"
                  name="motivo"
                  list="motivos"
                  autoComplete="off"
                  className={`${FIELD} w-full`}
                />
              </FieldLabel>
            </div>
            <Submit disabled={busy}>
              {busy ? QUEUE.busy.discard : QUEUE.discard}
            </Submit>
          </>
        )}
      </QueueForm>
    </details>
  )
}
