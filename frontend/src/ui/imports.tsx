import type { RatingQueue } from '@filmes/engine'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { ratingField, type RatingRefusal } from '#/content/rating-form'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { ImportsOverview } from '#/platform/imports'
import { IMPORTS } from './imports.copy'
import {
  Alert,
  CatalogSearch,
  Item,
  Items,
  Meta,
  Notice,
  OwnerTag,
  Section,
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
        <a href={backTo} className={buttonVariants({ variant: 'option' })}>
          {back}
        </a>
      </header>
      {children}
    </main>
  )
}

/** A row of a list that leads to another page. */
function LinkRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li className="border-rule not-first:border-t">
      <a
        href={href}
        className="flex min-h-touch flex-wrap items-center gap-x-sm gap-y-xs px-xl py-sm text-ink no-underline"
      >
        {children}
        <span aria-hidden="true" className="ml-auto text-ink-2">
          ›
        </span>
      </a>
    </li>
  )
}

const listClass =
  'flex flex-col overflow-hidden rounded-card border border-rule bg-surface'

/** `/importar`: each Pessoa, with how many imports she has, and the
 * resolution queue. `overview` is null when the engine cannot run here. */
export function ImportsList({
  overview,
  gone = false,
}: {
  overview: ImportsOverview | null
  gone?: boolean
}) {
  return (
    <ImportsFrame back={IMPORTS.back} backTo="/">
      <div className="flex flex-col gap-sm">
        <h1 className="font-display text-title">{IMPORTS.title}</h1>
        <p className="text-ink-2">{IMPORTS.lead}</p>
      </div>
      {gone && <Alert>{IMPORTS.gone}</Alert>}
      {!overview ? (
        <Alert>{IMPORTS.unavailable}</Alert>
      ) : (
        <>
          <ul className={listClass}>
            <LinkRow href="/fila">
              <span className="font-semibold">{IMPORTS.queue}</span>
              <span className="text-meta text-ink-2">
                {IMPORTS.queued(overview.queued)}
              </span>
            </LinkRow>
          </ul>
          <section aria-labelledby="pessoas" className="flex flex-col gap-sm">
            <h2
              id="pessoas"
              className="font-display text-label text-ink-2 uppercase"
            >
              {IMPORTS.people}
            </h2>
            {overview.people.length === 0 ? (
              <p className="text-ink-2">{IMPORTS.empty}</p>
            ) : (
              <ul className={listClass}>
                {overview.people.map(({ person, name, owner, imports }) => (
                  <LinkRow
                    key={person}
                    href={`/importar/${encodeURIComponent(person)}`}
                  >
                    <span className="font-semibold">{name}</span>
                    {owner && <OwnerTag />}
                    <span className="text-meta text-ink-2">
                      {IMPORTS.count(imports)}
                    </span>
                  </LinkRow>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </ImportsFrame>
  )
}

// --- the rating screen (#144), the Import's twin ------------------------------

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

/** The Notas not yet written, each with "Tirar", and Pronto, a plain POST
 * of them. */
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
    <Section id="minhas-notas" title={RATINGS.draft} lead={RATINGS.draftLead}>
      <Items empty={RATINGS.empty}>
        {rated.map(([id, entry]) => (
          <Item
            key={id}
            actions={
              <Button
                variant="option"
                aria-label={RATINGS.remove(entry.title)}
                onClick={() => onRemove(id)}
              >
                {RATINGS.removeLabel}
              </Button>
            }
          >
            <span className="font-semibold">{entry.title}</span>
            <Meta parts={[yearText(entry.year), RATINGS.rate(entry.rating)]} />
          </Item>
        ))}
      </Items>
      <form method="post" action={`${PATH}/enviar`} onSubmit={onSend}>
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
      className="flex flex-col gap-xl rounded-card border border-rule bg-surface p-xl"
    >
      <div className="flex flex-col gap-xs">
        <h2 className="font-display text-title">{film.title}</h2>
        <Meta parts={[yearText(film.year), film.meta.join(', ')]} />
      </div>
      <div className="flex flex-wrap gap-xs">
        {SCALE.map((rating) => (
          <Button
            key={rating}
            variant="option"
            className="min-w-touch px-0"
            aria-label={RATINGS.rate(rating)}
            onClick={() => onRate(rating)}
          >
            {rating}
          </Button>
        ))}
      </div>
      <Button variant="option" className="self-start" onClick={onSkip}>
        {RATINGS.notSeen}
      </Button>
    </article>
  )
}
