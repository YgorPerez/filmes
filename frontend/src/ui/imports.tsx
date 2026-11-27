import type { RatingQueue } from '@filmes/engine'
import { MY_TASTE, RATINGS_PATH } from '#/content/paths'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { ratingField, type RatingRefusal } from '#/content/rating-form'
import type { SearchAnswer } from '#/platform/catalog-search'
import { useFetchForm, type Answered } from './kit/fetch-form'
import { usePostedFeedback } from './kit/posted-feedback'
import { Chip } from './kit/chip'
import { TapeCase } from './kit/tape-case'
import { Slip } from './kit/slip'
import {
  Alert,
  CatalogSearch,
  Meta,
  Notice,
  PostFailed,
  Submit,
} from './person-parts'
import {
  loadDraft,
  parseDraft,
  saveDraft,
  sending,
  settle,
  storedDraft,
  withoutRating,
  withRating,
  withSkipped,
  type Draft,
} from './rating-draft'
import { RatingDisc } from './person-marks'
import { RATINGS } from './ratings.copy'
import { buttonVariants } from './kit/button-variants'
import { Button } from './shadcn/button'

/** The frame of the Imports screens: the letreiro and the way back. */
export function ImportsFrame({
  back,
  backTo,
  children,
}: {
  back: string
  backTo: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-3xl px-2xl py-3xl">
      <header className="flex flex-wrap items-center justify-between gap-xl">
        <a href={backTo} className={buttonVariants({ variant: 'option' })}>
          {back}
        </a>
      </header>
      {children}
    </main>
  )
}

// --- the rating screen (#144), the Import's twin ------------------------------

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** The Nota a digit key gives on the rating card: 1 to 9, and 0 for 10. */
const digitRating = (key: string) =>
  /^[0-9]$/.test(key) ? Number(key) || 10 : null

/** The film on the card: the year and the genres (from the Fila) in chips,
 * or the year and the directors (from the search). */
type CardFilm = {
  id: string
  title: string
  year: number | null
  /** The genres, in chips. */
  chips: readonly string[]
  /** The directors, under them. */
  meta: readonly string[]
}

/** Another tab changed the storage. */
const subscribe = (changed: () => void) => {
  window.addEventListener('storage', changed)
  return () => window.removeEventListener('storage', changed)
}

const yearText = (year: number | null) => (year === null ? null : `${year}`)

/** The film to rate now: the one picked in the search, until it has a Nota
 * or is passed over; then the next of the Fila the draft has not taken. */
function cardFilm(
  queue: RatingQueue,
  draft: Draft,
  search: SearchAnswer | null,
  film: string | undefined,
): CardFilm | null {
  const taken = (id: string) =>
    id in draft.ratings || draft.skipped.includes(id)
  const picked =
    film !== undefined && search && 'found' in search && !taken(film)
      ? search.found.films.find((f) => f.id === film)
      : undefined
  if (picked) return { ...picked, chips: [], meta: picked.directors }
  const next = queue.films.find((f) => !taken(f.id))
  return next ? { ...next, chips: next.genres, meta: [] } : null
}

/** The rating screen (`RATINGS_PATH`) for a Dono with no Letterboxd nor Trakt. One
 * film of her Fila de Notas at a time, a Nota of 1 to 10 or "Não vi"; the
 * Catálogo search picks another film. The Notas wait in the browser's draft
 * until Pronto posts them to `/notas/enviar`, which writes them in one
 * commit and comes back saying how many (`written`); with the JavaScript,
 * by `fetch`, without a reload (#240). `queue` is null when the engine
 * cannot run on this server. */
export function RatingScreen({
  queue,
  search,
  film,
  written,
  refusal,
}: {
  queue: RatingQueue | null
  search: SearchAnswer | null
  film?: string
  written?: number
  refusal?: RatingRefusal
}) {
  const { feedback, onAnswer } = usePostedFeedback()
  return (
    <ImportsFrame back={RATINGS.back} backTo={MY_TASTE}>
      <div className="flex flex-col gap-sm">
        <h1 className="font-display text-page-title">{RATINGS.title}</h1>
        <p className="text-ink-2">{RATINGS.lead}</p>
      </div>
      {(written !== undefined || refusal) && (
        <div ref={feedback}>
          {written !== undefined && <Notice>{RATINGS.written(written)}</Notice>}
          {refusal && <Alert>{RATINGS.refusals[refusal]}</Alert>}
        </div>
      )}
      {queue === null ? (
        <Alert>{RATINGS.unavailable}</Alert>
      ) : (
        <Rating
          queue={queue}
          search={search}
          film={film}
          settled={written !== undefined ? 'written' : refusal && 'refused'}
          onAnswer={onAnswer}
        />
      )}
    </ImportsFrame>
  )
}

/** The draft as the page holds it. What the server's page had: none. In
 * the browser, the stored one, settled by Pronto's answer, until the Dono
 * changes it; each change is stored at once. */
function useDraft(person: string, settled?: 'written' | 'refused') {
  const stored = useSyncExternalStore(
    subscribe,
    () => storedDraft(person),
    () => null,
  )
  const [edited, setEdited] = useState<Draft | null>(null)
  const kept = parseDraft(stored)
  const draft = edited ?? (settled ? settle(kept, settled === 'written') : kept)
  useEffect(() => {
    if (settled)
      saveDraft(person, settle(loadDraft(person), settled === 'written'))
  }, [person, settled])
  const change = (next: Draft) => {
    saveDraft(person, next)
    setEdited(next)
  }
  return [draft, change] as const
}

/** Pronto's answer, heard without a reload: written, the sent Notas leave
 * the draft; refused, they stay. */
type OnAnswer = (to: string, form: HTMLFormElement) => Answered

function Rating({
  queue,
  search,
  film,
  settled,
  onAnswer,
}: {
  queue: RatingQueue
  search: SearchAnswer | null
  film?: string
  settled?: 'written' | 'refused'
  onAnswer: OnAnswer
}) {
  const person = queue.person
  const [draft, change] = useDraft(person, settled)
  const sent: OnAnswer = (to, form) => {
    const answer = new URL(to, window.location.origin).searchParams
    if (answer.has('feito') || answer.has('erro'))
      change(settle(loadDraft(person), answer.has('feito')))
    return onAnswer(to, form)
  }
  const current = cardFilm(queue, draft, search, film)
  const pick = (id: string) => {
    const params = new URLSearchParams({ filme: id })
    if (search) params.set('buscar', search.query)
    return `${RATINGS_PATH}?${params.toString()}`
  }
  return (
    <>
      {current ? (
        <FilmCard
          film={current}
          onRate={(rating) => change(withRating(draft, current, rating))}
          onSkip={() => change(withSkipped(draft, current.id))}
        />
      ) : (
        <p className="text-ink-2">{RATINGS.over}</p>
      )}
      <CatalogSearch
        action={RATINGS_PATH}
        scope="films"
        answer={search}
        pick={pick}
      />
      <DraftSection
        draft={draft}
        onRemove={(id) => change(withoutRating(draft, id))}
        onSend={() => saveDraft(person, sending(draft))}
        onAnswer={sent}
      />
    </>
  )
}

/** The Notas not yet written, each on its orange disc with "Tirar", and
 * Pronto, a POST of them (by `fetch` once the JavaScript is in): the
 * screen's one orange button. */
function DraftSection({
  draft,
  onRemove,
  onSend,
  onAnswer,
}: {
  draft: Draft
  onRemove: (id: string) => void
  onSend: () => void
  onAnswer: OnAnswer
}) {
  const rated = Object.entries(draft.ratings)
  const { onSubmit, busy, failed } = useFetchForm(onAnswer)
  return (
    <Slip
      id="minhas-notas"
      title={RATINGS.draft}
      aside={String(rated.length)}
      lead={RATINGS.draftLead}
    >
      {rated.length === 0 ? (
        <p className="text-ink-2">{RATINGS.empty}</p>
      ) : (
        <ul className="flex flex-col">
          {rated.map(([id, entry]) => (
            <li
              key={id}
              className="flex items-center gap-lg border-rule py-sm not-first:border-t"
            >
              <RatingDisc>{entry.rating}</RatingDisc>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-display text-row-title">
                  {entry.title}
                </span>
                <Meta
                  parts={[yearText(entry.year), RATINGS.rate(entry.rating)]}
                />
              </span>
              <Button
                variant="link"
                aria-label={RATINGS.remove(entry.title)}
                onClick={() => onRemove(id)}
              >
                {RATINGS.removeLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        method="post"
        action="/notas/enviar"
        onSubmit={(event) => {
          onSend()
          onSubmit(event)
        }}
      >
        {rated.map(([id, entry]) => (
          <input
            key={id}
            type="hidden"
            name={ratingField(id)}
            value={entry.rating}
          />
        ))}
        <PostFailed failed={failed} />
        <Submit
          variant="primary"
          disabled={rated.length === 0 || busy !== null}
          className="w-full"
        >
          {busy === null ? RATINGS.done(rated.length) : RATINGS.writing}
        </Submit>
      </form>
    </Slip>
  )
}

/** The film to rate: on its tape (the title on the cover, as the Fila has
 * no poster), its year and genres in chips, and the scale of 1 to 10
 * (DESIGN.md, Escala de nota): two rows of five on a phone, so each
 * number keeps a 44px target. A tap on a number is the Nota; with the
 * focus on the card, so is a digit key (0 for 10). */
function FilmCard({
  film,
  onRate,
  onSkip,
}: {
  film: CardFilm
  onRate: (rating: number) => void
  onSkip: () => void
}) {
  return (
    <article
      aria-label={RATINGS.queueLabel}
      onKeyDown={(event) => {
        const rating = digitRating(event.key)
        if (rating === null || event.altKey || event.ctrlKey || event.metaKey)
          return
        event.preventDefault()
        onRate(rating)
      }}
      className="flex flex-col gap-xl rounded-card border border-rule bg-surface p-xl pt-2xl"
    >
      <div className="flex gap-xl">
        <TapeCase
          className="w-[88px] sm:w-[112px]"
          cover={<span aria-hidden="true">{film.title}</span>}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          <h2 className="font-display text-title">{film.title}</h2>
          <div className="flex flex-wrap gap-xs">
            {film.year !== null && <Chip>{String(film.year)}</Chip>}
            {film.chips.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </div>
          {film.meta.length > 0 && (
            <p className="text-meta text-ink-2">{film.meta.join(', ')}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-xs border-t border-dashed border-rule pt-xl">
        <div
          role="group"
          aria-label={RATINGS.scale}
          className="grid grid-cols-5 gap-0.75 min-[480px]:grid-cols-10"
        >
          {SCALE.map((rating) => (
            <button
              key={rating}
              type="button"
              aria-label={RATINGS.rate(rating)}
              onClick={() => onRate(rating)}
              className="min-h-touch cursor-pointer rounded-rail border-(length:--border-width-stroke) border-rule bg-surface font-display text-field-label text-ink tabular-nums hover:border-ink active:border-sticker-orange active:bg-sticker-orange active:text-on-sticker"
            >
              {rating}
            </button>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="flex justify-between text-meta text-ink-2"
        >
          <span>{RATINGS.scaleLow}</span>
          <span>{RATINGS.scaleHigh}</span>
        </div>
      </div>
      <Button variant="option" className="self-start" onClick={onSkip}>
        {RATINGS.notSeen}
      </Button>
    </article>
  )
}
