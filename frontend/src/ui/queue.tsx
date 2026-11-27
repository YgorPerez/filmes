import { FIELD } from './kit/field'
import type { ReactNode } from 'react'
import type { QueueNotice, QueueRefusal } from '#/content/import-action'
import { MY_TASTE, QUEUE_PATH } from '#/content/paths'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { QueueEntry, QueuePage, QueueSuggestion } from '#/platform/imports'
import { ImportsFrame } from './imports'
import { QUEUE } from './queue.copy'
import { PostAnswers, PostForm } from './kit/post-form'
import { usePostedFeedback } from './kit/posted-feedback'
import { PageHead } from './kit/page-head'
import { TapeCase } from './kit/tape-case'
import { Alert, Disclosure, Notice, Submit, TextField } from './person-parts'
import { Button } from './shadcn/button'

/** What the last decision did, and on which film (`item`, to take it
 * back, and its `title`). */
export type QueueDoneView = {
  notice: QueueNotice
  resolved?: number
  left?: number
  item?: string
  title?: string
}

/** The Catálogo search one film's card asked for (`?buscar=&para=`). */
export type QueueSearchView = { item: string; answer: SearchAnswer }

/** A form of the queue: a POST to `/fila/acao`, by `fetch` once the
 * JavaScript is in (#240). `children` see whether its post is running. */
function QueueForm({
  action,
  id,
  label,
  className = 'flex flex-col gap-xl',
  children,
}: {
  action: 'confirmar' | 'descartar' | 'reprocessar' | 'reabrir'
  id?: string
  label?: string
  className?: string
  children: (busy: boolean) => ReactNode
}) {
  return (
    <PostForm action="/fila/acao" label={label} className={className}>
      {(busy) => (
        <>
          <input type="hidden" name="acao" value={action} />
          {id !== undefined && <input type="hidden" name="id" value={id} />}
          {children(busy)}
        </>
      )}
    </PostForm>
  )
}

/** The resolution queue (`QUEUE_PATH`): the films of the imports that wait
 * for the Dono, one card each, with TMDB's suggestions (poster and
 * synopsis, to tell twins apart), the Catálogo search for another title,
 * the link as a last resort, and the reasons to take a film out. What the
 * last decision did names the film, with Desfazer. `queue` is null when
 * the engine cannot run here. */
export function QueueScreen({
  queue,
  done,
  refusal,
  search,
}: {
  queue: QueuePage | null
  done?: QueueDoneView
  refusal?: QueueRefusal
  search?: QueueSearchView
}) {
  const { feedback, onAnswer } = usePostedFeedback()
  return (
    <PostAnswers onAnswer={onAnswer}>
      <ImportsFrame back={QUEUE.back} backTo={`${MY_TASTE}/importar`}>
        <PageHead title={QUEUE.title} lead={QUEUE.lead} />
        {(refusal || done) && (
          <div ref={feedback}>
            {refusal && <Alert>{QUEUE.refusals[refusal]}</Alert>}
            {done && <Done done={done} />}
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
                  <Card
                    key={item.id}
                    item={item}
                    names={queue.names}
                    search={search?.item === item.id ? search.answer : null}
                  />
                ))}
              </ul>
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
            {queue.attributions.length > 0 && (
              <p className="text-source text-ink-2">{QUEUE.attribution}</p>
            )}
          </>
        )}
      </ImportsFrame>
    </PostAnswers>
  )
}

/** The last decision, naming the film, with Desfazer when it can be. */
function Done({ done }: { done: QueueDoneView }) {
  const undoable =
    done.item !== undefined &&
    (done.notice === 'confirmado' || done.notice === 'descartado')
  return (
    <div className="flex flex-col gap-xs">
      <Notice>
        {QUEUE.notices[done.notice](done.title, done.resolved, done.left)}
      </Notice>
      {undoable && (
        <QueueForm action="reabrir" id={done.item} className="self-start">
          {(busy) => (
            <Button
              type="submit"
              variant="link"
              disabled={busy}
              aria-label={QUEUE.undoLabel(done.title ?? '')}
            >
              {busy ? QUEUE.busy.reopen : QUEUE.undo}
            </Button>
          )}
        </QueueForm>
      )}
    </div>
  )
}

/** The film the import could not place: a tape with no label yet. */
function BlankTape() {
  return (
    <div aria-hidden="true" className="w-16 sm:w-20">
      <TapeCase
        cover={<span className="font-display text-cover-mark">?</span>}
      />
    </div>
  )
}

function Card({
  item,
  names,
  search,
}: {
  item: QueueEntry
  names: Record<string, string>
  search: SearchAnswer | null
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
              {QUEUE.stake(item.people.map((p) => names[p] ?? p))}
            </p>
          </div>
        </div>
        {item.candidates.length > 0 && <Suggestions item={item} />}
        <Disclosure summary={QUEUE.search} open={search !== null}>
          <FindInCatalog item={item} title={title} search={search} />
        </Disclosure>
        <Disclosure summary={QUEUE.link}>
          <Confirm id={item.id} title={title} />
        </Disclosure>
        <Discard id={item.id} title={title} />
      </section>
    </li>
  )
}

/** TMDB's films with the title, each with its poster and synopsis and
 * confirmed with one tap. */
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
    <li className="flex items-start gap-md border-rule py-md not-first:border-t">
      <div className="w-14 shrink-0">
        <TapeCase
          cover={
            candidate.poster ? (
              <img
                src={candidate.poster}
                alt={QUEUE.poster(label)}
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <span aria-hidden="true" className="text-cover-mark">
                ?
              </span>
            )
          }
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2xs">
        <a
          href={candidate.link}
          rel="noreferrer"
          target="_blank"
          className="font-display text-row-title text-ink underline decoration-rule underline-offset-3 hover:decoration-ink"
        >
          {label}
        </a>
        {candidate.originalTitle && (
          <span className="text-meta text-ink-2">
            {QUEUE.original(candidate.originalTitle)}
          </span>
        )}
        {candidate.overview && (
          <p className="line-clamp-2 text-meta text-ink-2">
            {candidate.overview}
          </p>
        )}
        <QueueForm action="confirmar" id={id} className="mt-xs self-start">
          {(busy) => (
            <>
              <input type="hidden" name="filme" value={candidate.link} />
              <Button
                type="submit"
                disabled={busy}
                aria-label={QUEUE.pickLabel(label, candidate.originalTitle)}
              >
                {busy ? QUEUE.busy.confirm : QUEUE.pick}
              </Button>
            </>
          )}
        </QueueForm>
      </div>
    </li>
  )
}

/** The Catálogo search for this film: a GET to the queue with the film it
 * is for (`para`), each result confirmed with one tap. */
function FindInCatalog({
  item,
  title,
  search,
}: {
  item: QueueEntry
  title: string
  search: SearchAnswer | null
}) {
  return (
    <div className="flex flex-col gap-lg">
      <form
        method="get"
        action={QUEUE_PATH}
        role="search"
        aria-label={QUEUE.searchLabel(title)}
        className="flex flex-wrap items-end gap-sm"
      >
        <input type="hidden" name="para" value={item.id} />
        <label className="flex min-w-0 flex-1 basis-[200px] flex-col gap-xs">
          <span className="font-display text-field-label">
            {QUEUE.searchField}{' '}
            <span className="font-body font-normal text-ink-2">
              {QUEUE.searchHint}
            </span>
          </span>
          <input
            type="search"
            name="buscar"
            defaultValue={search?.query ?? item.name}
            required
            autoComplete="off"
            className={`${FIELD} w-full`}
          />
        </label>
        <Submit>{QUEUE.searchSubmit}</Submit>
      </form>
      {search && <Found item={item} answer={search} />}
    </div>
  )
}

function Found({ item, answer }: { item: QueueEntry; answer: SearchAnswer }) {
  if ('refused' in answer) return <Alert>{QUEUE.refusals.indisponivel}</Alert>
  const { films } = answer.found
  if (films.length === 0)
    return <p className="text-meta text-ink-2">{QUEUE.none}</p>
  return (
    <div className="flex flex-col gap-xs">
      <p role="status" className="text-meta text-ink-2">
        {QUEUE.found(answer.query)}
      </p>
      <ul className="flex flex-col">
        {films.map((film) => {
          const label = QUEUE.item(film.title, film.year)
          const directors = film.directors.join(', ')
          return (
            <li
              key={film.id}
              className="flex items-center justify-between gap-md border-rule py-sm not-first:border-t"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-display text-row-title">{label}</span>
                {directors && (
                  <span className="text-meta text-ink-2">{directors}</span>
                )}
              </span>
              <QueueForm action="confirmar" id={item.id} className="shrink-0">
                {(busy) => (
                  <>
                    <input type="hidden" name="filme" value={film.id} />
                    <Button
                      type="submit"
                      variant="option"
                      disabled={busy}
                      aria-label={QUEUE.pickLabel(label, directors || null)}
                    >
                      {busy ? QUEUE.busy.confirm : QUEUE.pick}
                    </Button>
                  </>
                )}
              </QueueForm>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The film the Dono names by its link: an IMDb or a TMDB link, or a
 * tconst. */
function Confirm({ id, title }: { id: string; title: string }) {
  return (
    <QueueForm
      action="confirmar"
      id={id}
      label={`${QUEUE.confirm} ${title}`}
      className="flex flex-col gap-sm sm:flex-row sm:items-end"
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

/** Out of the queue, with one of the reasons, one button each. */
function Discard({ id, title }: { id: string; title: string }) {
  return (
    <QueueForm
      action="descartar"
      id={id}
      label={`${QUEUE.discard}: ${title}`}
      className="flex flex-wrap items-center gap-xs border-t border-dashed border-rule pt-lg"
    >
      {(busy) => (
        <>
          <span className="font-display text-field-label">
            {QUEUE.discard}:
          </span>
          {QUEUE.reasons.map(({ value, label }) => (
            <Button
              key={value}
              type="submit"
              name="motivo"
              value={value}
              variant="option"
              disabled={busy}
              aria-label={QUEUE.reasonLabel(label, title)}
            >
              {busy ? QUEUE.busy.discard : label}
            </Button>
          ))}
        </>
      )}
    </QueueForm>
  )
}
