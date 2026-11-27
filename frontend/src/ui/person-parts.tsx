import type { EntityMatch, FilmMatch, FilmRef } from '@filmes/engine'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import {
  formProblem,
  isPersonRefusal,
  type FieldProblem,
} from '#/content/person-action'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { PERSON } from './person.copy'
import { FIELD } from './kit/field'
import { useFetchForm, useGetForm, useHydrated } from './kit/fetch-form'
import { refusalOn, useRefusalInPlace } from './kit/refusal-in-place'
import {
  searchFilms,
  type CatalogScope,
  type SearchAnswer,
} from './kit/film-search'
import { FieldLabel } from './kit/field-label'
import { Icon } from './kit/icon'
import { Alert, Notice, PostFailed } from './kit/status'
import { buttonVariants } from './kit/button-variants'
import { Button } from './shadcn/button'

// The pieces the Pessoas screens share, and the other Dono screens with
// them: the alert and the notice, a section's card, the fields, the forms
// that post an action and their submit button. The alert and the notice
// are kit/status's; these screens take them from here with the rest of
// their parts, which keeps kit/status under fallow's coupling threshold
// (its fan-in at most the project's p95).

export { Alert, Notice, PostFailed }

/** A section of the Pessoa's page: a card with its title. */
export function Section({
  id,
  title,
  lead,
  plain = false,
  children,
}: {
  id: string
  title: string
  lead?: string
  /** No card: a section inside a fold or another card, apart by its
   * heading and the space around it (#272). */
  plain?: boolean
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className={`flex flex-col gap-xl ${plain ? '' : 'rounded-card border border-rule bg-surface p-xl'}`}
    >
      <div className="flex flex-col gap-xs">
        <h2 id={id} className="font-display text-title">
          {title}
        </h2>
        {lead && <p className="text-meta text-ink-2">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

/** The items of a section, one per row, or what to say when there are
 * none. */
export function Items({
  empty,
  children,
}: {
  empty: string
  children: ReactNode[]
}) {
  return children.length === 0 ? (
    <p className="text-ink-2">{empty}</p>
  ) : (
    <ul className="flex flex-col">{children}</ul>
  )
}

export function Item({
  children,
  actions,
}: {
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-sm border-rule py-sm not-first:border-t">
      <div className="flex min-w-0 flex-1 basis-[240px] flex-col gap-0.5">
        {children}
      </div>
      {actions}
    </li>
  )
}

/** The line under an item: its parts joined by a middle dot. */
export function Meta({ parts }: { parts: readonly (string | null)[] }) {
  return (
    <span className="text-meta text-ink-2">
      {parts.filter((part) => part !== null && part !== '').join(' · ')}
    </span>
  )
}

/** What the submit buttons of a form say while its post runs (they are
 * disabled then), null when none runs: `Submit` reads it. */
const Posting = createContext<string | null>(null)

/** After a post that went through: a form in a fold empties and the fold
 * closes, as a new page would have it, the focus on its summary. */
function settle(form: HTMLFormElement) {
  const fold = form.closest('details')
  if (!fold) return
  form.reset()
  fold.open = false
  fold.querySelector('summary')?.focus()
}

/** The `ActionForm` showing the refusal its post got (its id), null when
 * none does, and how a form says it: one alert at a time says what the
 * last post did. */
const RefusedIn = createContext<{
  form: string | null
  show: (form: string | null) => void
} | null>(null)

/** The Pessoa's page's forms (`ActionForm`): the refusal one of them
 * shows in place hides the page's own notice and the refusals the others
 * showed before. */
export function ActionForms({ children }: { children: ReactNode }) {
  const [form, show] = useState<string | null>(null)
  return (
    <RefusedIn.Provider value={{ form, show }}>{children}</RefusedIn.Provider>
  )
}

/** True while an `ActionForm` shows its refusal in place: the notice or
 * refusal the page came with is no longer what the last post did. */
export const useRefusedInPlace = () =>
  (useContext(RefusedIn)?.form ?? null) !== null

/** The field of the `ActionForm` around that its action would refuse, and
 * what to say under it: `TextField` and `SelectField` read it. */
const ProblemIn = createContext<FieldProblem | null>(null)

/** A field's `aria-invalid`, `aria-describedby` and the text under it, when
 * the form's problem is this field's (`name`). */
function useFieldProblem(name: string) {
  const id = useId()
  const problem = useContext(ProblemIn)
  if (problem?.field !== name) return { error: undefined, aria: {} }
  return {
    error: { id, text: PERSON.fieldProblem(problem) },
    aria: { 'aria-invalid': true, 'aria-describedby': id } as const,
  }
}

/** A form that posts one action to the Pessoa's route
 * (`platform/people.ts`). A plain POST: it works before the JavaScript.
 * With it (#235), it posts by `fetch`: a refusal shows here, over what was
 * typed; what went through reloads the page through the router. Its
 * submits say `busy` while the post runs. With the JavaScript, a field the
 * action would refuse (`formProblem`) keeps the post: the field is marked,
 * says why under it and takes the focus (#268); typing clears it. */
export function ActionForm({
  slug,
  action,
  label,
  className,
  busy = PERSON.saving,
  children,
}: {
  slug: string
  action: string
  label?: string
  className?: string
  busy?: string
  children: ReactNode
}) {
  const id = useId()
  const shared = useContext(RefusedIn)
  const { refused, alert, onAnswer } = useRefusalInPlace(
    undefined,
    refusalOn(isPersonRefusal),
  )
  const {
    onSubmit,
    busy: running,
    failed,
  } = useFetchForm((to, form) => {
    const kept = onAnswer(to)
    shared?.show(kept ? id : null)
    if (kept) return true
    settle(form)
    return false
  })
  const shown = shared === null || shared.form === id ? refused : undefined
  const [problem, setProblem] = useState<FieldProblem | null>(null)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!problem) return
    const field = form.current?.elements.namedItem(problem.field)
    if (field instanceof HTMLElement) field.focus()
  }, [problem])
  return (
    <form
      ref={form}
      method="post"
      action={`/pessoas/${encodeURIComponent(slug)}/acao`}
      aria-label={label}
      onSubmit={(event) => {
        const found = formProblem(new FormData(event.currentTarget))
        setProblem(found)
        if (found) event.preventDefault()
        else onSubmit(event)
      }}
      onInput={() => setProblem(null)}
      className={className ?? 'flex flex-col gap-xl'}
    >
      {shown && (
        <div ref={alert} className="basis-full">
          <Alert>{PERSON.refusals[shown]}</Alert>
        </div>
      )}
      <PostFailed failed={failed} />
      <input type="hidden" name="acao" value={action} />
      <ProblemIn.Provider value={problem}>
        <Posting.Provider value={running === null ? null : busy}>
          {children}
        </Posting.Provider>
      </ProblemIn.Provider>
    </form>
  )
}

/** "Tirar": takes one item out of her file. */
export function RemoveForm({
  slug,
  what,
  id,
  label,
}: {
  slug: string
  what: 'stated' | 'report' | 'veto' | 'seen'
  id: string
  label: string
}) {
  return (
    <ActionForm
      slug={slug}
      action="remover"
      className="shrink-0"
      busy={PERSON.removing}
    >
      <input type="hidden" name="tipo" value={what} />
      <input type="hidden" name="id" value={id} />
      <Submit className="" aria-label={PERSON.removeLabel(label)}>
        {PERSON.remove}
      </Submit>
    </ActionForm>
  )
}

/** A form that opens on demand, as a `<details>`: no JavaScript needed. */
export function Disclosure({
  summary,
  open,
  children,
}: {
  summary: string
  /** Open from the start: the form came back refused. */
  open?: boolean
  children: ReactNode
}) {
  return (
    <details
      open={open}
      className="group/fold rounded-field border border-rule"
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-sm px-3 font-semibold select-none [&::-webkit-details-marker]:hidden">
        {summary}
        {/* The drawn +, a × while open: the fold's state not by colour. */}
        <Icon
          name="plus"
          className="size-[18px] text-ink-2 transition-transform group-open/fold:rotate-45 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-rule p-xl">{children}</div>
    </details>
  )
}

const control = `${FIELD} w-full`

export function TextField({
  name,
  label,
  hint,
  required = false,
  placeholder,
  pattern,
  type = 'text',
  min,
  max,
  defaultValue,
}: {
  name: string
  label: string
  hint?: string
  required?: boolean
  placeholder?: string
  pattern?: string
  type?: 'text' | 'number' | 'email'
  min?: number
  max?: number
  defaultValue?: string
}) {
  const { error, aria } = useFieldProblem(name)
  return (
    <FieldLabel label={label} hint={hint} error={error}>
      <input
        {...aria}
        type={type}
        min={min}
        max={max}
        name={name}
        required={required}
        placeholder={placeholder}
        pattern={pattern}
        defaultValue={defaultValue}
        autoComplete="off"
        className={control}
      />
    </FieldLabel>
  )
}

export function SelectField({
  name,
  label,
  hint,
  options,
  defaultValue,
}: {
  name: string
  label: string
  hint?: string
  options: readonly { value: string; label: string }[]
  defaultValue?: string
}) {
  const { error, aria } = useFieldProblem(name)
  return (
    <FieldLabel label={label} hint={hint} error={error}>
      <select
        {...aria}
        name={name}
        defaultValue={defaultValue}
        className={control}
      >
        {options.map(({ value, label: text }) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </FieldLabel>
  )
}

/** The submit of a form, with every Button prop (`disabled`...): an
 * option at the start of its line unless `variant` or `className` say
 * otherwise. In an `ActionForm` whose post runs, it is disabled and says
 * what the form is doing, in its name too. */
export function Submit({
  variant = 'option',
  className = 'self-start',
  disabled,
  children,
  'aria-label': label,
  ...props
}: Omit<ComponentProps<typeof Button>, 'type'>) {
  const posting = useContext(Posting)
  return (
    <Button
      type="submit"
      variant={variant}
      className={className}
      disabled={disabled === true || posting !== null}
      // While posting, its name is what it does, as its text says.
      aria-label={posting === null ? label : undefined}
      {...props}
    >
      {posting ?? children}
    </Button>
  )
}

/** A link that looks like a button: `primary` for the screen's main
 * action, `option` for the others. */
function LinkButton({
  href,
  variant = 'option',
  label,
  children,
}: {
  href: string
  variant?: 'primary' | 'option'
  label?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      aria-label={label}
      className={buttonVariants({ variant, className: 'self-start' })}
    >
      {children}
    </a>
  )
}

// --- the Catálogo search ----------------------------------------------------
//
// The Catálogo search of the screens that take IDs (#128): a plain GET form
// to the page itself (`?buscar=`), so it works before the JavaScript, and
// the results with their IDs. A film can carry a "Usar" link that puts its
// ID in the page's form (`pick`).

const filmText = (film: FilmRef) =>
  film.year === null ? film.title : `${film.title} (${film.year})`

/** The ID, selected whole with one tap, to copy into a field. */
function Id({ id }: { id: string }) {
  return (
    <code className="rounded-field bg-surface-2 px-1.5 py-0.5 text-meta select-all">
      {id}
    </code>
  )
}

/** How a film's "Usar" takes it: a link to the page with it (`pick`,
 * before the JavaScript), or in place (`onPick`). */
export type Pick = {
  pick?: (id: string) => string
  onPick?: (film: { id: string; label: string }) => void
}

/** "Usar": the link, or the button that takes the film in place. */
export function PickFilm({
  id,
  label,
  pick,
  onPick,
}: Pick & { id: string; label: string }) {
  const { pickLabel } = CATALOG_SEARCH
  if (onPick)
    return (
      <Button
        type="button"
        variant="option"
        className="self-start"
        aria-label={pickLabel(label)}
        onClick={() => onPick({ id, label })}
      >
        {CATALOG_SEARCH.pick}
      </Button>
    )
  if (!pick) return null
  return (
    <LinkButton href={pick(id)} label={pickLabel(label)}>
      {CATALOG_SEARCH.pick}
    </LinkButton>
  )
}

function FilmItem({ film, pick, onPick }: Pick & { film: FilmMatch }) {
  const { votes } = CATALOG_SEARCH
  const title = filmText(film)
  return (
    <Item
      actions={
        <PickFilm id={film.id} label={title} pick={pick} onPick={onPick} />
      }
    >
      <span className="flex flex-wrap items-center gap-sm">
        <span className="font-semibold">{title}</span> <Id id={film.id} />
      </span>
      <Meta parts={[film.directors.join(', '), votes(film.votes)]} />
    </Item>
  )
}

function EntityItem({ entity }: { entity: EntityMatch }) {
  const { links, films } = CATALOG_SEARCH
  return (
    <Item>
      <span className="flex flex-wrap items-center gap-sm">
        <span className="font-semibold">{entity.label}</span>{' '}
        <Id id={entity.id} />
      </span>
      <Meta
        parts={[
          entity.links.map((link) => links[link]).join(', '),
          films(entity.filmCount),
          entity.knownFor.map(filmText).join(', '),
        ]}
      />
    </Item>
  )
}

function Group({ title, children }: { title: string; children: ReactNode[] }) {
  if (children.length === 0) return null
  return (
    <div className="flex flex-col gap-xs">
      <h3 className="font-display text-label text-ink-2 uppercase">{title}</h3>
      <ul className="flex flex-col">{children}</ul>
    </div>
  )
}

function CatalogResults({
  answer,
  pick,
  onPick,
}: Pick & { answer: SearchAnswer }) {
  const { groups, results, none, refusals } = CATALOG_SEARCH
  if ('refused' in answer) return <Alert>{refusals[answer.refused]}</Alert>
  const { films, people, genres, series } = answer.found
  const entities = (list: readonly EntityMatch[]) =>
    list.map((e) => <EntityItem key={e.id} entity={e} />)
  const empty =
    films.length + people.length + genres.length + series.length === 0
  return (
    <div className="flex flex-col gap-xl" aria-label={results(answer.query)}>
      <p className="text-meta text-ink-2" role="status">
        {empty ? none : results(answer.query)}
      </p>
      <Group title={groups.films}>
        {films.map((f) => (
          <FilmItem key={f.id} film={f} pick={pick} onPick={onPick} />
        ))}
      </Group>
      <Group title={groups.people}>{entities(people)}</Group>
      <Group title={groups.genres}>{entities(genres)}</Group>
      <Group title={groups.series}>{entities(series)}</Group>
    </div>
  )
}

/** The search card: the form, then the answer of the page's `?buscar=`.
 * `keep` are the page's other query values the search must not lose (the
 * films Nova Sessão already took for "Parecido com"). */
export function CatalogSearch({
  action,
  scope,
  answer,
  keep = {},
  pick,
}: {
  action: string
  scope: CatalogScope
  answer: SearchAnswer | null
  keep?: Readonly<Record<string, string | undefined>>
  pick?: (id: string) => string
}) {
  const { title, leadFilms, leadAll, label, hint, submit } = CATALOG_SEARCH
  const onSubmit = useGetForm()
  return (
    <Section
      id="buscar-catalogo"
      title={title}
      lead={scope === 'films' ? leadFilms : leadAll}
    >
      <form
        method="get"
        action={action}
        role="search"
        aria-label={title}
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-sm"
      >
        {Object.entries(keep).map(
          ([name, value]) =>
            value !== undefined && (
              <input key={name} type="hidden" name={name} value={value} />
            ),
        )}
        <label className="flex min-w-0 flex-1 basis-[220px] flex-col gap-xs">
          <span className="font-display text-field-label">
            {label}{' '}
            <span className="font-body font-normal text-ink-2">{hint}</span>
          </span>
          <input
            type="search"
            name="buscar"
            defaultValue={answer?.query}
            required
            autoComplete="off"
            className={`${FIELD} w-full`}
          />
        </label>
        <Submit className="">{submit}</Submit>
      </form>
      {answer && <CatalogResults answer={answer} pick={pick} />}
    </Section>
  )
}

// The Catálogo search inside a form that posts (Nova Sessão, Contar como
// foi), and the films "Parecido com" took.
//
// Before the JavaScript, the search is a button that sends the form with
// `buscar-catalogo=sim`, so the server keeps what the form holds and comes
// back with the search; Enter in the field searches too (the form's
// default button says `tecla=enter`, and `buscado`, what the field came
// back with, tells a new search from one already run: `searchAsked`).
// With the JavaScript (#235), it searches while the Dono types, the
// button goes, and Enter in the field sends nothing.

/** How long the search waits after the last key. */
const DEBOUNCE_MS = 300
/** The shortest text the engine searches. */
const MIN_LENGTH = 2
/** A whole IMDb id: searched at once. */
const IMDB_ID = /^tt\d{7,}$/

/** The search of what the Dono types: `answer` for the text `query`,
 * `searching` while one runs. Only the latest search lands. */
function useLiveSearch(
  on: boolean,
  typed: string,
  initial: SearchAnswer | null,
) {
  const [query, setQuery] = useState(typed)
  const [answer, setAnswer] = useState(initial)
  const [searching, setSearching] = useState(false)
  const latest = useRef(0)
  const searched = useRef(typed)

  useEffect(() => {
    if (!on) return
    const text = query.trim()
    if (text === searched.current) return
    const run = ++latest.current
    const land = (found: SearchAnswer | null) => {
      if (run !== latest.current) return
      searched.current = text
      setAnswer(found)
      setSearching(false)
    }
    if (text.length < MIN_LENGTH) {
      land(null)
      return
    }
    const timer = setTimeout(
      () => {
        setSearching(true)
        searchFilms(text).then(land, () =>
          land({ query: text, refused: 'indisponivel' }),
        )
      },
      IMDB_ID.test(text) ? 0 : DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [on, query])

  /** Puts `text` in the field as searched already: the answer stays. */
  const fill = (text: string) => {
    latest.current++
    searched.current = text
    setSearching(false)
    setQuery(text)
  }

  return { query, setQuery, fill, answer, searching }
}

/** The Catálogo search of a form that posts. With `fill`, the field is the
 * film the form sends (Contar como foi): "Usar" puts the film's id in it,
 * and `onType` hears the Dono typing over it. */
export function SessionFilmLookup({
  name,
  label,
  answer: initial,
  value,
  pick,
  onPick,
  fill: fills = false,
  onType,
}: Pick & {
  name: 'buscar' | 'busca'
  label: string
  answer: SearchAnswer | null
  value?: string
  fill?: boolean
  onType?: () => void
}) {
  const live = useHydrated()
  const typed = value ?? initial?.query ?? ''
  const { query, setQuery, fill, answer, searching } = useLiveSearch(
    live,
    typed,
    initial,
  )
  const take =
    onPick &&
    ((film: { id: string; label: string }) => {
      if (fills) fill(film.id)
      onPick(film)
    })
  return (
    <section aria-label={CATALOG_SEARCH.title} className="flex flex-col gap-lg">
      <div className="grid items-end gap-sm sm:grid-cols-[1fr_auto]">
        <FieldLabel label={label}>
          <span className="relative flex">
            <input
              type="search"
              name={name}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                onType?.()
              }}
              onKeyDown={(event) => {
                if (live && event.key === 'Enter') event.preventDefault()
              }}
              autoComplete="off"
              enterKeyHint="search"
              aria-busy={searching}
              className={`${FIELD} w-full ${searching ? 'pr-28' : ''}`}
            />
            {searching && (
              <span
                role="status"
                className="pointer-events-none absolute top-1/2 right-10 -translate-y-1/2 text-meta text-ink-2"
              >
                {CATALOG_SEARCH.searching}
              </span>
            )}
          </span>
        </FieldLabel>
        {!live && (
          <Submit name="buscar-catalogo" value="sim" formNoValidate>
            {CATALOG_SEARCH.submit}
          </Submit>
        )}
      </div>
      <input type="hidden" name="buscado" value={query.trim()} />
      {answer && <CatalogResults answer={answer} pick={pick} onPick={take} />}
    </section>
  )
}

/** A film "Parecido com" took: its id, and its title once known. */
export type ChosenFilm = { readonly id: string; readonly label?: string }

/** The films "Parecido com" took, each with a × to let it go, over the
 * field the form posts (`name`, the ids by comma). The titles it does not
 * know yet (films that came in the URL) it looks up by id. */
export function ChosenFilms({
  name,
  label,
  empty,
  films,
  onRemove,
  onLabel,
}: {
  name: string
  label: string
  empty: string
  films: readonly ChosenFilm[]
  onRemove: (id: string) => void
  onLabel: (id: string, label: string) => void
}) {
  const unknown = films
    .filter((film) => film.label === undefined)
    .map((film) => film.id)
    .join(',')
  useEffect(() => {
    if (unknown === '') return
    let live = true
    for (const id of unknown.split(','))
      searchFilms(id).then(
        (answer) => {
          const film =
            answer && 'found' in answer
              ? answer.found.films.find((f) => f.id === id)
              : undefined
          if (live && film) onLabel(id, filmText(film))
        },
        () => undefined,
      )
    return () => {
      live = false
    }
  }, [unknown, onLabel])

  return (
    <div className="flex flex-col gap-xs">
      <span className="font-display text-field-label">{label}</span>
      <input
        type="hidden"
        name={name}
        value={films.map((film) => film.id).join(',')}
      />
      {films.length === 0 ? (
        <p className="text-meta text-ink-2">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-sm">
          {films.map((film) => (
            <li
              key={film.id}
              className="flex items-center gap-xs rounded-pill border border-rule bg-surface-2 py-1 pr-1 pl-3"
            >
              <span>{film.label ?? film.id}</span>
              <button
                type="button"
                aria-label={CATALOG_SEARCH.remove(film.label ?? film.id)}
                onClick={() => onRemove(film.id)}
                className="flex size-touch cursor-pointer items-center justify-center rounded-pill text-ink-2"
              >
                {/* The drawn +, turned into a ×, as the folds' close. */}
                <Icon name="plus" className="size-[16px] rotate-45" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
