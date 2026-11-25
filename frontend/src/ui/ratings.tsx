import type { RatingQueue } from '@filmes/engine'
import { useEffect, useState } from 'react'
import { ratingField, type RatingRefusal } from '#/content/rating-form'
import type { SearchAnswer } from '#/platform/catalog-search'
import { Marquee } from './marquee'
import {
  Alert,
  CatalogSearch,
  Item,
  Items,
  Meta,
  Notice,
  Section,
  SubmitButton,
} from './person-parts'
import {
  emptyDraft,
  loadDraft,
  saveDraft,
  settle,
  type Draft,
} from './rating-draft'
import { RATINGS } from './ratings.copy'
import { Button, buttonVariants } from './shadcn/button'

const PATH = '/notas'
const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/** The film on the card: its line under the title is the year and the
 * genres (from the Fila) or the directors (from the search). */
type CardFilm = {
  id: string
  title: string
  year: number | null
  meta: readonly string[]
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
  if (picked) return { ...picked, meta: picked.directors }
  const next = queue.films.find((f) => !taken(f.id))
  return next ? { ...next, meta: next.genres } : null
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
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <a href="/" className={buttonVariants({ variant: 'quiet' })}>
          {RATINGS.back}
        </a>
      </header>
      <div className="flex flex-col gap-sm">
        <h1 className="text-title">{RATINGS.title}</h1>
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
    </main>
  )
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
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  // The draft is the browser's: read after the first paint, so the server's
  // HTML and the browser's agree.
  useEffect(() => {
    const stored = loadDraft(person)
    const now = settled ? settle(stored, settled === 'written') : stored
    saveDraft(person, now)
    setDraft(now)
  }, [person, settled])

  const change = (next: Draft) => {
    saveDraft(person, next)
    setDraft(next)
  }
  const current = cardFilm(queue, draft, search, film)
  const rate = (target: CardFilm, rating: number) =>
    change({
      ...draft,
      ratings: {
        ...draft.ratings,
        [target.id]: { title: target.title, year: target.year, rating },
      },
    })
  const skip = (target: CardFilm) =>
    change({ ...draft, skipped: [...draft.skipped, target.id] })
  const remove = (id: string) => {
    const { [id]: _removed, ...ratings } = draft.ratings
    change({ ...draft, ratings })
  }
  const rated = Object.entries(draft.ratings)
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
          onRate={(rating) => rate(current, rating)}
          onSkip={() => skip(current)}
        />
      ) : (
        <p className="text-ink-2">{RATINGS.over}</p>
      )}
      <CatalogSearch action={PATH} scope="films" answer={search} pick={pick} />
      <Section id="minhas-notas" title={RATINGS.draft} lead={RATINGS.draftLead}>
        <Items empty={RATINGS.empty}>
          {rated.map(([id, entry]) => (
            <Item
              key={id}
              actions={
                <Button
                  variant="quiet"
                  aria-label={RATINGS.remove(entry.title)}
                  onClick={() => remove(id)}
                >
                  {RATINGS.removeLabel}
                </Button>
              }
            >
              <span className="font-semibold">{entry.title}</span>
              <Meta
                parts={[yearText(entry.year), RATINGS.rate(entry.rating)]}
              />
            </Item>
          ))}
        </Items>
        <form
          method="post"
          action={`${PATH}/enviar`}
          onSubmit={() =>
            saveDraft(person, { ...draft, sent: rated.map(([id]) => id) })
          }
        >
          {rated.map(([id, entry]) => (
            <input
              key={id}
              type="hidden"
              name={ratingField(id)}
              value={entry.rating}
            />
          ))}
          <SubmitButton disabled={rated.length === 0}>
            {RATINGS.done(rated.length)}
          </SubmitButton>
        </form>
      </Section>
    </>
  )
}

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
      className="flex flex-col gap-md rounded-card border border-rule bg-surface p-md"
    >
      <div className="flex flex-col gap-xs">
        <h2 className="text-title">{film.title}</h2>
        <Meta parts={[yearText(film.year), film.meta.join(', ')]} />
      </div>
      <div className="flex flex-wrap gap-xs">
        {SCALE.map((rating) => (
          <Button
            key={rating}
            variant="quiet"
            className="min-w-touch px-0"
            aria-label={RATINGS.rate(rating)}
            onClick={() => onRate(rating)}
          >
            {rating}
          </Button>
        ))}
      </div>
      <Button variant="quiet" className="self-start" onClick={onSkip}>
        {RATINGS.notSeen}
      </Button>
    </article>
  )
}
