import { FIELD } from './kit/field'
import { createContext, useContext, type ReactNode } from 'react'
import type { QueueNotice, QueueRefusal } from '#/content/import-action'
import { importsPath, MY_TASTE, QUEUE_PATH } from '#/content/paths'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { QueueEntry, QueuePage, QueueSuggestion } from '#/platform/imports'
import { ImportsFrame } from './imports'
import { QUEUE } from './queue.copy'
import { PostAnswers, PostForm } from './kit/post-form'
import { usePostedFeedback } from './kit/posted-feedback'
import { PageHead } from './kit/page-head'
import { Icon } from './kit/icon'
import { PosterCover, TapeCase } from './kit/tape-case'
import { Alert, Notice, Submit, TextField } from './person-parts'
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

/** Whose import sent the Dono here (`de`), carried by every form of the
 * page so it comes back to the same back pill (#274). */
const FromContext = createContext<string | undefined>(undefined)

/** `de`, as a hidden field, when some import sent her here. */
function FromField() {
  const from = useContext(FromContext)
  return from === undefined ? null : (
    <input type="hidden" name="de" value={from} />
  )
}

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
          <FromField />
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
 * the engine cannot run here. `from`, the Pessoa whose import sent her
 * here, takes the back pill to that import ("Importar · Olga", #274). */
export function QueueScreen({
  queue,
  done,
  refusal,
  search,
  from,
}: {
  queue: QueuePage | null
  done?: QueueDoneView
  refusal?: QueueRefusal
  search?: QueueSearchView
  from?: string
}) {
  const { feedback, onAnswer } = usePostedFeedback()
  const fromName = from === undefined ? undefined : queue?.names[from]
  const [back, backTo] =
    from !== undefined && fromName !== undefined
      ? [QUEUE.backFrom(fromName), importsPath(from, false)]
      : [QUEUE.back, `${MY_TASTE}/importar`]
  return (
    <FromContext value={fromName === undefined ? undefined : from}>
      <PostAnswers onAnswer={onAnswer}>
        <ImportsFrame back={back} backTo={backTo}>
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
                      first={item.id === firstSuggested(queue)}
                    />
                  ))}
                </ul>
              )}
              {/* Nothing waits: nothing to ask the TMDB again (#274). */}
              {queue.items.length > 0 && (
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
              )}
              {queue.attributions.length > 0 && (
                <p className="text-source text-ink-2">{QUEUE.attribution}</p>
              )}
            </>
          )}
        </ImportsFrame>
      </PostAnswers>
    </FromContext>
  )
}

/** The first film with TMDB's suggestions: its first one is the page's
 * one orange button (#274). */
const firstSuggested = (queue: QueuePage) =>
  queue.items.find((item) => item.candidates.length > 0)?.id

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

/** The film the import could not place: its tape with the title the
 * file gave on the cover, as Dar notas shows one with no poster (#274). */
function BlankTape({ title }: { title: string }) {
  return (
    <div aria-hidden="true" className="w-20 shrink-0">
      <TapeCase small cover={<span className="line-clamp-6">{title}</span>} />
    </div>
  )
}

function Card({
  item,
  names,
  search,
  first,
}: {
  item: QueueEntry
  names: Record<string, string>
  search: SearchAnswer | null
  /** The first card with suggestions: its first one is the one orange
   * button (#274). */
  first: boolean
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
          <BlankTape title={title} />
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
        {item.candidates.length > 0 && (
          <Suggestions item={item} first={first} />
        )}
        {/* One fold for the other ways: the Catálogo, then the link
            (#274). */}
        <Fold summary={QUEUE.search} open={search !== null}>
          <FindInCatalog item={item} title={title} search={search} />
          <div className="flex flex-col gap-sm border-t border-dashed border-rule pt-lg">
            <p className="font-display text-field-label">{QUEUE.link}</p>
            <Confirm id={item.id} title={title} />
          </div>
        </Fold>
        <Discard id={item.id} title={title} />
      </section>
    </li>
  )
}

/** The card's fold: a row under a dashed rule with the drawn +, not a
 * bordered box inside the card (#274, no card in a card). */
function Fold({
  summary,
  open,
  children,
}: {
  summary: string
  open: boolean
  children: ReactNode
}) {
  return (
    <details
      open={open}
      className="group/fold border-t border-dashed border-rule pt-xs"
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        {summary}
        <Icon
          name="plus"
          className="size-[18px] shrink-0 text-ink-2 transition-[rotate] group-open/fold:rotate-45 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-lg pt-md">{children}</div>
    </details>
  )
}

/** TMDB's films with the title, each with its poster and synopsis and
 * confirmed with one tap. */
function Suggestions({ item, first }: { item: QueueEntry; first: boolean }) {
  return (
    <div className="flex flex-col gap-xs border-t border-dashed border-rule pt-lg">
      <h3 className="font-display text-label text-ink-2 uppercase">
        {QUEUE.candidates}
      </h3>
      <ul className="flex flex-col">
        {item.candidates.map((candidate, index) => (
          <Suggestion
            key={candidate.tmdb}
            id={item.id}
            candidate={candidate}
            primary={first && index === 0}
          />
        ))}
      </ul>
    </div>
  )
}

function Suggestion({
  id,
  candidate,
  primary,
}: {
  id: string
  candidate: QueueSuggestion
  primary: boolean
}) {
  const label = QUEUE.item(candidate.title, candidate.year)
  const details = QUEUE.details(candidate)
  return (
    <li className="flex items-start gap-md border-rule py-md not-first:border-t">
      <div className="w-20 shrink-0">
        <TapeCase
          small
          cover={
            <PosterCover
              src={candidate.poster}
              title={label}
              alt={QUEUE.poster(label)}
              lazy
              fallback={
                <span aria-hidden="true" className="line-clamp-6">
                  {label}
                </span>
              }
            />
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
        {details && <span className="text-meta">{details}</span>}
        {candidate.overview ? (
          <p className="line-clamp-2 text-meta text-ink-2">
            {candidate.overview}
          </p>
        ) : (
          candidate.language && (
            <p className="text-meta text-ink-2">{QUEUE.noOverview}</p>
          )
        )}
        <QueueForm action="confirmar" id={id} className="mt-xs self-start">
          {(busy) => (
            <>
              <input type="hidden" name="filme" value={candidate.link} />
              <Button
                type="submit"
                variant={primary ? 'primary' : 'option'}
                disabled={busy}
                aria-label={QUEUE.pickLabel(
                  label,
                  details ?? candidate.originalTitle,
                )}
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
        <FromField />
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
      className="flex flex-col gap-xs border-t border-dashed border-rule pt-lg"
    >
      {(busy) => (
        <>
          <span className="font-display text-field-label">{QUEUE.discard}</span>
          <span className="flex flex-wrap gap-xs">
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
          </span>
        </>
      )}
    </QueueForm>
  )
}
