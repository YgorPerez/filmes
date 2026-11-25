import type { RatingQueue } from '@filmes/engine'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { ratingField, type RatingRefusal } from '#/content/rating-form'
import type { SearchAnswer } from '#/platform/catalog-search'
import { Brand } from './kit/brand'
import { Chip } from './kit/chip'
import { TapeCase } from './kit/tape-case'
import {
  Alert,
  CatalogSearch,
  Meta,
  Notice,
  SubmitButton,
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
import { Ficha, RatingDisc } from './person-marks'
import { RATINGS } from './ratings.copy'
import { Button, buttonVariants } from './shadcn/button'

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
        <Brand />
        <a href={backTo} className={buttonVariants({ variant: 'option' })}>
          {back}
        </a>
      </header>
      {children}
    </main>
  )
}

// --- the rating screen (#144), the Import's twin ------------------------------

const PATH = '/notas'
const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

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

/** `/notas`: the rating screen for a Dono with no Letterboxd nor Trakt. One
 * film of her Fila de Notas at a time, a Nota of 1 to 10 or "Não vi"; the
 * Catálogo search picks another film. The Notas wait in the browser's draft
 * until Pronto posts them to `/notas/enviar`, which writes them in one
 * commit and comes back saying how many (`written`). `queue` is null when
 * the engine cannot run on this server. */
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
  return (
    <ImportsFrame back={RATINGS.back} backTo="/">
      <div className="flex flex-col gap-sm">
        <h1 className="font-display text-title">{RATINGS.title}</h1>
        <p className="text-ink-2">{RATINGS.lead}</p>
      </div>
      {written !== undefined && <Notice>{RATINGS.written(written)}</Notice>}
      {refusal && <Alert>{RATINGS.refusals[refusal]}</Alert>}
      {queue === null ? (
        <Alert>{RATINGS.unavailable}</Alert>
      ) : (
        <Rating
          queue={queue}
          search={search}
          film={film}
          settled={written !== undefined ? 'written' : refusal && 'refused'}
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

function Rating({
  queue,
  search,
  film,
  settled,
}: {
  queue: RatingQueue
  search: SearchAnswer | null
  film?: string
  settled?: 'written' | 'refused'
}) {
  const person = queue.person
  const [draft, change] = useDraft(person, settled)
  const current = cardFilm(queue, draft, search, film)
  const pick = (id: string) => {
    const params = new URLSearchParams({ filme: id })
    if (search) params.set('buscar', search.query)
    return `${PATH}?${params.toString()}`
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
      <CatalogSearch action={PATH} scope="films" answer={search} pick={pick} />
      <DraftSection
        draft={draft}
        onRemove={(id) => change(withoutRating(draft, id))}
        onSend={() => saveDraft(person, sending(draft))}
      />
    </>
  )
}

/** The Notas not yet written, each on its orange disc with "Tirar", and
 * Pronto, a plain POST of them: the screen's one orange button. */
function DraftSection({
  draft,
  onRemove,
  onSend,
}: {
  draft: Draft
  onRemove: (id: string) => void
  onSend: () => void
}) {
  const rated = Object.entries(draft.ratings)
  return (
    <Ficha
      id="minhas-notas"
      title={RATINGS.draft}
      count={String(rated.length)}
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
                <span className="font-display text-[15px] font-bold">
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
      <form method="post" action={`${PATH}/enviar`} onSubmit={onSend}>
        {rated.map(([id, entry]) => (
          <input
            key={id}
            type="hidden"
            name={ratingField(id)}
            value={entry.rating}
          />
        ))}
        <SubmitButton disabled={rated.length === 0} className="w-full">
          {RATINGS.done(rated.length)}
        </SubmitButton>
      </form>
    </Ficha>
  )
}

/** The film to rate: on its tape (the title on the cover, as the Fila has
 * no poster), its year and genres in chips, and the scale of 1 to 10
 * (DESIGN.md, Escala de nota). A tap on a number is the Nota. */
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
          className="grid grid-cols-10 gap-[3px]"
        >
          {SCALE.map((rating) => (
            <button
              key={rating}
              type="button"
              aria-label={RATINGS.rate(rating)}
              onClick={() => onRate(rating)}
              className="min-h-touch cursor-pointer rounded-rail border-[1.5px] border-rule bg-surface font-display text-[14px] font-bold text-ink tabular-nums hover:border-ink active:border-sticker-orange active:bg-sticker-orange active:text-on-sticker"
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
