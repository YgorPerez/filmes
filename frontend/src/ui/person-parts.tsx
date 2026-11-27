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
  type Ref,
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
  searchCatalog,
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
  id,
  children,
  actions,
}: {
  /** For a link to the item (`#id`): an edit comes back to it (#330). */
  id?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <li
      id={id}
      className="flex scroll-mt-2xl flex-wrap items-start justify-between gap-sm border-rule py-sm not-first:border-t"
    >
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
  /** Whose page: a refusal names her. */
  name: string
} | null>(null)

/** Who a refusal names outside a Pessoa's page. */
const NO_NAME = 'esta Pessoa'

/** The Pessoa's page's forms (`ActionForm`): the refusal one of them
 * shows in place hides the page's own notice and the refusals the others
 * showed before. `name` is hers, for the refusals. */
export function ActionForms({
  name = NO_NAME,
  children,
}: {
  name?: string
  children: ReactNode
}) {
  const [form, show] = useState<string | null>(null)
  return (
    <RefusedIn.Provider value={{ form, show, name }}>
      {children}
    </RefusedIn.Provider>
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

/** The field a form would refuse, focused when it is marked. */
function useProblemFocus(initial: FieldProblem | null) {
  const [problem, setProblem] = useState<FieldProblem | null>(initial)
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (!problem) return
    // A search field stands for the hidden one it fills (`TargetField`).
    const field =
      form.current?.querySelector(`[data-field="${problem.field}"]`) ??
      form.current?.elements.namedItem(problem.field)
    if (field instanceof HTMLElement) field.focus()
  }, [problem])
  return { form, problem, setProblem }
}

type ActionFormProps = {
  slug: string
  action: string
  label?: string
  className?: string
  busy?: string
  /** The field the server refused, when this form came back refused
   * without the JavaScript (#273): marked from the start. */
  problem?: FieldProblem | null
  /** After a post that went through, before the page reloads: an edit
   * closes (#330). */
  onDone?: () => void
  children: ReactNode
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
  problem: initialProblem = null,
  onDone,
  children,
}: ActionFormProps) {
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
    onDone?.()
    return false
  })
  const shown = shared === null || shared.form === id ? refused : undefined
  const { form, problem, setProblem } = useProblemFocus(initialProblem)
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
          <Alert>{PERSON.refusals(shared?.name ?? NO_NAME)[shown]}</Alert>
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

/** "Tirar": takes one item out of her file. With the JavaScript, it asks
 * first, in place (#330): beside "Editar", a slip of the thumb would lose
 * the item. Before it, the post goes at once. */
export function RemoveForm({
  slug,
  what,
  id,
  label,
  onAsking,
  mayAsk = () => true,
}: {
  slug: string
  what: 'stated' | 'report' | 'veto' | 'seen'
  id: string
  label: string
  /** While it asks: its row hides what else it offers. */
  onAsking?: (asking: boolean) => void
  /** Whether it may ask now: an edit with changes elsewhere holds it. */
  mayAsk?: () => boolean
}) {
  const live = useHydrated()
  const [asking, setAsking] = useState(false)
  const toggle = (value: boolean) => {
    setAsking(value)
    onAsking?.(value)
  }
  const confirm = useRef<HTMLButtonElement>(null)
  const ask = useRef<HTMLButtonElement>(null)
  const [asked, setAsked] = useState(false)
  useEffect(() => {
    if (asking) confirm.current?.focus()
    else if (asked) ask.current?.focus()
  }, [asking, asked])
  // Another form's post lets the question go (#347): the page comes back
  // with what that form did, not with this confirm still open.
  useEffect(() => {
    if (!asking) return
    const letGo = (event: SubmitEvent) => {
      // Its own post went: what it is doing stays on screen.
      if (
        event.target instanceof Node &&
        confirm.current !== null &&
        event.target.contains(confirm.current)
      ) {
        document.removeEventListener('submit', letGo, true)
        return
      }
      setAsked(false)
      setAsking(false)
      onAsking?.(false)
    }
    document.addEventListener('submit', letGo, true)
    return () => document.removeEventListener('submit', letGo, true)
  }, [asking, onAsking])
  return (
    <ActionForm
      slug={slug}
      action="remover"
      className="flex shrink-0 flex-wrap gap-xs"
      busy={PERSON.removing}
    >
      <input type="hidden" name="tipo" value={what} />
      <input type="hidden" name="id" value={id} />
      {live && asking && (
        <p className="basis-full text-meta text-ink-2">
          {PERSON.removeWarning}
        </p>
      )}
      {live && !asking ? (
        <Button
          ref={ask}
          type="button"
          variant="option"
          aria-label={PERSON.removeLabel(label)}
          onClick={() => {
            if (mayAsk()) toggle(true)
          }}
        >
          {PERSON.remove}
        </Button>
      ) : (
        <Submit
          ref={confirm}
          // The decisive step, marked as a chosen option: no new colour.
          variant={live ? 'chosen' : 'option'}
          className=""
          aria-label={
            live ? PERSON.removeSure(label) : PERSON.removeLabel(label)
          }
        >
          {live ? PERSON.removeSureShort : PERSON.remove}
        </Submit>
      )}
      {live && asking && (
        <Button
          type="button"
          variant="link"
          onClick={() => {
            toggle(false)
            setAsked(true)
          }}
        >
          {PERSON.removeKeep}
        </Button>
      )}
    </ActionForm>
  )
}

/** A form that opens on demand, as a `<details>`: no JavaScript needed. */
export function Disclosure({
  id,
  summary,
  open,
  children,
}: {
  /** For a link to the fold (`#id`). */
  id?: string
  summary: string
  /** Open from the start: the form came back refused. */
  open?: boolean
  children: ReactNode
}) {
  return (
    <details
      id={id}
      open={open}
      className="scroll-mt-2xl rounded-field border border-rule"
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-sm px-3 py-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
        {summary}
        {/* The drawn +, a × while open: the fold's state not by colour.
         * Only its own fold turns it: a group variant would match any open
         * fold around this one too. */}
        <Icon
          name="plus"
          className="size-[18px] shrink-0 text-ink-2 transition-[rotate] motion-reduce:transition-none [details[open]>summary>&]:rotate-45"
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
  refusal,
  inputRef,
  onInput,
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
  /** What a form outside `ActionForm` refused of this field (#347): said
   * under it, the field marked. */
  refusal?: string
  inputRef?: Ref<HTMLInputElement>
  onInput?: () => void
}) {
  const fromForm = useFieldProblem(name)
  const id = useId()
  const { error, aria } =
    refusal === undefined
      ? fromForm
      : {
          error: { id, text: refusal },
          aria: { 'aria-invalid': true, 'aria-describedby': id } as const,
        }
  return (
    <FieldLabel label={label} hint={hint} error={error}>
      <input
        {...aria}
        ref={inputRef}
        onInput={onInput}
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

/** A Nota from 1 to 10 as radios, the scale the rating screen and the
 * Feedback use, with "sem Nota" first: ten cells, the chosen one on the
 * orange disc. Posts `n/10`, or nothing. */
export function RatingField({
  name,
  label,
  defaultValue = '',
}: {
  name: string
  label: string
  /** `n/10`, or '' for none. */
  defaultValue?: string
}) {
  const cell =
    'group/rating relative grid h-touch min-w-0 cursor-pointer place-items-center rounded-rail bg-surface-2 font-display text-field-label text-ink tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus'
  const radio = 'absolute inset-0 m-0 size-full cursor-pointer opacity-0'
  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="mb-xs font-display text-field-label">{label}</legend>
      <div className="grid grid-cols-5 gap-0.75">
        <label className={`${cell} col-span-5 px-lg`}>
          <input
            type="radio"
            name={name}
            value=""
            defaultChecked={defaultValue === ''}
            className={radio}
          />
          <span className="rounded-pill px-sm py-0.5 group-has-checked/rating:bg-ink group-has-checked/rating:text-surface">
            {PERSON.noRating}
          </span>
        </label>
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
          <label key={n} className={cell}>
            <input
              type="radio"
              name={name}
              value={`${n}/10`}
              defaultChecked={defaultValue === `${n}/10`}
              aria-label={n}
              className={radio}
            />
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-round group-has-checked/rating:bg-sticker-orange group-has-checked/rating:text-on-sticker"
            >
              {n}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
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
  /** The button's words, when it is not "Usar" (the rating screen's "Dar
   * nota"). */
  pickAs?: PickWords
}

export type PickWords = {
  text: string
  label: (title: string) => string
  /** The rating screen's results (#274): no ID, the directors as the card
   * says them, and her Nota of a film she rated, whose pick then changes
   * it (`change`). */
  card?: {
    directedBy: (names: readonly string[]) => string
    rated: (id: string) => number | undefined
    ratedText: (rating: number) => string
    change: { text: string; label: (title: string) => string }
  }
}

/** "Usar": the link, or the button that takes the film in place. */
export function PickFilm({
  id,
  label,
  pick,
  onPick,
  pickAs = { text: CATALOG_SEARCH.pick, label: CATALOG_SEARCH.pickLabel },
}: Pick & { id: string; label: string }) {
  if (onPick)
    return (
      <Button
        type="button"
        variant="option"
        className="self-start"
        aria-label={pickAs.label(label)}
        onClick={() => onPick({ id, label })}
      >
        {pickAs.text}
      </Button>
    )
  if (!pick) return null
  return (
    <LinkButton href={pick(id)} label={pickAs.label(label)}>
      {pickAs.text}
    </LinkButton>
  )
}

function FilmItem({ film, pick, onPick, pickAs }: Pick & { film: FilmMatch }) {
  if (pickAs?.card)
    return (
      <CardFilmItem
        film={film}
        pick={pick}
        onPick={onPick}
        pickAs={pickAs}
        card={pickAs.card}
      />
    )
  const { votes } = CATALOG_SEARCH
  const title = filmText(film)
  return (
    <Item
      actions={
        <PickFilm
          id={film.id}
          label={title}
          pick={pick}
          onPick={onPick}
          pickAs={pickAs}
        />
      }
    >
      <span className="flex flex-wrap items-center gap-sm">
        <span className="font-semibold">{title}</span> <Id id={film.id} />
      </span>
      <Meta parts={[film.directors.join(', '), votes(film.votes)]} />
    </Item>
  )
}

/** A film of the rating screen's search (#274): its title, the directors
 * and the votes, and her Nota when she gave one; then "Dar nota", or
 * "Mudar". */
function CardFilmItem({
  film,
  pick,
  onPick,
  pickAs,
  card,
}: Pick & { film: FilmMatch; card: NonNullable<PickWords['card']> }) {
  const { votes } = CATALOG_SEARCH
  const title = filmText(film)
  const rating = card.rated(film.id)
  return (
    <Item
      actions={
        <PickFilm
          id={film.id}
          label={title}
          pick={pick}
          onPick={onPick}
          pickAs={rating === undefined ? pickAs : card.change}
        />
      }
    >
      <span className="font-semibold">{title}</span>
      <Meta
        parts={[
          film.directors.length > 0 ? card.directedBy(film.directors) : null,
          votes(film.votes),
          rating === undefined ? null : card.ratedText(rating),
        ]}
      />
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

/** "Terror · gênero": an entity as the chip of a picked target says it. */
const entityText = (entity: EntityMatch) =>
  PERSON.targetChip(
    entity.label,
    entity.links.map((link) => CATALOG_SEARCH.links[link]).join(', '),
  )

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
  pickAs,
}: Pick & {
  answer: SearchAnswer
}) {
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
          <FilmItem
            key={f.id}
            film={f}
            pick={pick}
            onPick={onPick}
            pickAs={pickAs}
          />
        ))}
      </Group>
      <Group title={groups.people}>{entities(people)}</Group>
      <Group title={groups.genres}>{entities(genres)}</Group>
      <Group title={groups.series}>{entities(series)}</Group>
    </div>
  )
}

// --- the target of a Pessoa's form ------------------------------------------
//
// What a Veto, a Declarado, a Relato or a Já visto is about (#273): with the
// JavaScript, a search by name whose result, picked, fills the hidden field
// the form posts and shows as a chip ("Terror · gênero"); a Veto also offers
// the tag groups as pills. Before the JavaScript, the field takes the ID
// (tt… or Q…), as the server reads it.

/** A tag group a Veto can name. */
type TagGroup = { key: string; label: string }

/** The tag groups as pills: radios, so the form posts the marked one
 * without the JavaScript. With it, a second tap on the marked one lets it
 * go; before it, "nenhum" does. */
function GroupPills({
  groups,
  initial = '',
  marked,
  onMark,
}: {
  groups: readonly TagGroup[]
  /** The group marked from the start: an edited Veto's (#330). */
  initial?: string
  /** With the JavaScript, the marked group, '' for none, and what a tap
   * on a pill marks: the target search lets its pick go then. */
  marked: string
  onMark: (key: string) => void
}) {
  const live = useHydrated()
  return (
    <fieldset className="flex flex-col gap-xs">
      <legend className="mb-xs font-display text-field-label">
        {PERSON.groupsLabel}
      </legend>
      <div className="flex flex-wrap gap-xs">
        {live ? (
          <LivePills groups={groups} marked={marked} onMark={onMark} />
        ) : (
          <PlainPills groups={groups} initial={initial} />
        )}
      </div>
    </fieldset>
  )
}

const PILL =
  'flex min-h-touch cursor-pointer items-center rounded-pill border-(length:--border-width-stroke) border-rule bg-surface px-lg font-display text-control text-ink select-none peer-checked:border-2 peer-checked:border-ink peer-checked:bg-surface-2 peer-checked:font-bold peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus'

/** The pills before the JavaScript: "nenhum" first and marked, so the
 * form posts no group unless one is marked. */
function PlainPills({
  groups,
  initial,
}: {
  groups: readonly TagGroup[]
  initial: string
}) {
  return [{ key: '', label: PERSON.noGroup }, ...groups].map(
    ({ key, label }) => (
      <label key={key || 'nenhum'} className="flex">
        <input
          type="radio"
          name="grupo"
          value={key}
          defaultChecked={key === initial}
          className="peer sr-only"
        />
        <span className={PILL}>{label}</span>
      </label>
    ),
  )
}

/** The pills with the JavaScript: a second tap on the marked one lets it
 * go. */
function LivePills({
  groups,
  marked,
  onMark: setMarked,
}: {
  groups: readonly TagGroup[]
  marked: string
  onMark: (key: string) => void
}) {
  return groups.map(({ key, label }) => (
    <label key={key} className="flex">
      <input
        type="radio"
        name="grupo"
        value={key}
        checked={marked === key}
        onChange={() => setMarked(key)}
        onClick={() => {
          if (marked === key) setMarked('')
        }}
        className="peer sr-only"
      />
      <span className={PILL}>{label}</span>
    </label>
  ))
}

/** The target of a form: `name` is the field it posts (`alvo`, or
 * `filme` for a Já visto, films only). */
export function TargetField({
  name,
  label,
  hint,
  scope,
  groups = [],
  initial = null,
  initialGroup,
}: {
  name: 'alvo' | 'filme'
  label: string
  hint?: string
  scope: CatalogScope
  /** The tag groups a Veto can name instead. */
  groups?: readonly TagGroup[]
  /** The target picked from the start: an edited item's (#330). */
  initial?: Target | null
  /** The tag group marked from the start: an edited Veto's. */
  initialGroup?: string
}) {
  const live = useHydrated()
  const film = name === 'filme'
  // One or the other (#330): picking a result lets the group go, and
  // marking a group lets the result go, so the form never shows both.
  const [picked, setPicked] = useState<Target | null>(initial)
  const [group, setGroup] = useState(initialGroup ?? '')
  // The result a group took the place of: letting the group go brings it
  // back, so a tap on a pill never loses the target for good.
  const before = useRef<Target | null>(null)
  return (
    <div className={`flex flex-col ${live ? 'gap-lg' : 'gap-xl'}`}>
      {live ? (
        <TargetSearch
          name={name}
          label={label}
          hint={hint}
          scope={scope}
          picked={picked}
          onPick={(target) => {
            setPicked(target)
            if (target !== null) setGroup('')
          }}
        />
      ) : (
        <TextField
          name={name}
          label={label}
          hint={film ? PERSON.filmHint : PERSON.idHint}
          pattern={film ? 'tt[0-9]+' : '(tt|Q)[0-9]+'}
          required={film}
          defaultValue={initial?.id}
        />
      )}
      {groups.length > 0 && (
        <GroupPills
          groups={groups}
          initial={initialGroup}
          marked={group}
          onMark={(key) => {
            setGroup(key)
            if (key !== '') {
              if (picked !== null) before.current = picked
              setPicked(null)
            } else if (before.current !== null) {
              setPicked(before.current)
              before.current = null
            }
          }}
        />
      )}
    </div>
  )
}

export type Target = { id: string; label: string }

/** The target with the JavaScript: a search by name; the picked result
 * fills the hidden field and shows as a chip. */
function TargetSearch({
  name,
  label,
  hint,
  scope,
  picked,
  onPick: setPicked,
}: {
  name: 'alvo' | 'filme'
  label: string
  hint?: string
  scope: CatalogScope
  picked: Target | null
  onPick: (target: Target | null) => void
}) {
  const { error, aria } = useFieldProblem(name)
  const search = useLiveSearch(picked === null, '', null, scope)
  return (
    <>
      <input type="hidden" name={name} value={picked?.id ?? ''} />
      {picked ? (
        <TargetChip
          label={label}
          picked={picked}
          onClear={() => setPicked(null)}
        />
      ) : (
        <FieldLabel label={label} hint={hint} error={error}>
          <input
            {...aria}
            data-field={name}
            type="search"
            value={search.query}
            placeholder={PERSON.targetSearch}
            onChange={(event) => search.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
            autoComplete="off"
            enterKeyHint="search"
            aria-busy={search.searching}
            className={`${FIELD} w-full`}
          />
        </FieldLabel>
      )}
      {!picked && search.answer && (
        <TargetResults
          answer={search.answer}
          scope={scope}
          onPick={setPicked}
        />
      )}
    </>
  )
}

/** How many results the target's search offers: the list stays above the
 * groups and the Gravar on a phone. */
const TARGET_RESULTS = 5

/** A result as an option: `name` is what its button says to a screen
 * reader ("Usar Terror · gênero"). */
type TargetOption = Target & { name: string; title: string; meta: string }

/** The search's answer as the options of the target's field (#273): each
 * result is one row, the whole row the button that picks it (44px or
 * more), with what it is in meta and no ID. Films first; a Já visto
 * offers only films. */
function TargetResults({
  answer,
  scope,
  onPick,
}: {
  answer: SearchAnswer
  scope: CatalogScope
  onPick: (target: Target) => void
}) {
  const { results, none, refusals, links, votes } = CATALOG_SEARCH
  if ('refused' in answer) return <Alert>{refusals[answer.refused]}</Alert>
  const { films, people, genres, series } = answer.found
  const options: TargetOption[] = [
    ...films.map((film) => ({
      id: film.id,
      label: PERSON.targetChip(filmText(film), PERSON.filmKind),
      name: filmText(film),
      title: filmText(film),
      meta: [PERSON.filmKind, film.directors.join(', '), votes(film.votes)]
        .filter((part) => part !== '')
        .join(' · '),
    })),
    ...(scope === 'films' ? [] : [...people, ...genres, ...series]).map(
      (entity) => ({
        id: entity.id,
        label: entityText(entity),
        name: entityText(entity),
        title: entity.label,
        meta: entity.links.map((link) => links[link]).join(', '),
      }),
    ),
  ].slice(0, TARGET_RESULTS)
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-meta text-ink-2" role="status">
        {options.length === 0 ? none : results(answer.query)}
      </p>
      {options.length > 0 && (
        <ul
          aria-label={results(answer.query)}
          className="flex flex-col overflow-hidden rounded-field border border-rule bg-surface"
        >
          {options.map((option) => (
            <li key={option.id} className="border-rule not-first:border-t">
              <button
                type="button"
                aria-label={CATALOG_SEARCH.pickLabel(option.name)}
                onClick={() => onPick({ id: option.id, label: option.label })}
                className="flex min-h-touch w-full cursor-pointer flex-col items-start justify-center gap-0.5 px-lg py-sm text-left text-ink hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                <span className="font-semibold">{option.title}</span>
                <span className="text-meta text-ink-2">{option.meta}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The picked target as a chip, with its × to let it go. */
function TargetChip({
  label,
  picked,
  onClear,
}: {
  label: string
  picked: Target
  onClear: () => void
}) {
  return (
    <div className="flex flex-col gap-xs">
      <span className="font-display text-field-label">{label}</span>
      <span className="flex items-center gap-xs self-start rounded-pill border border-rule bg-surface-2 py-1 pr-1 pl-3">
        <span>{picked.label}</span>
        <button
          type="button"
          aria-label={PERSON.clearTarget(picked.label)}
          onClick={onClear}
          className="flex size-touch cursor-pointer items-center justify-center rounded-pill text-ink-2"
        >
          {/* The drawn +, turned into a ×, as the chosen films'. */}
          <Icon name="plus" className="size-[16px] rotate-45" />
        </button>
      </span>
    </div>
  )
}

/** The page's other query values, as hidden fields. */
function Kept({
  values,
}: {
  values: Readonly<Record<string, string | undefined>>
}) {
  return Object.entries(values).map(
    ([name, value]) =>
      value !== undefined && (
        <input key={name} type="hidden" name={name} value={value} />
      ),
  )
}

type CatalogSearchProps = Pick & {
  action: string
  scope: CatalogScope
  answer: SearchAnswer | null
  keep?: Readonly<Record<string, string | undefined>>
  /** What the search is for here, over the default. */
  lead?: string
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
  onPick,
  pickAs,
  lead,
}: CatalogSearchProps) {
  const { title, leadFilms, leadAll, label, hint, submit } = CATALOG_SEARCH
  const onSubmit = useGetForm()
  return (
    <Section
      id="buscar-catalogo"
      title={title}
      lead={lead ?? (scope === 'films' ? leadFilms : leadAll)}
    >
      <form
        method="get"
        action={action}
        role="search"
        aria-label={title}
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-sm"
      >
        <Kept values={keep} />
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
      {answer && (
        <CatalogResults
          answer={answer}
          pick={pick}
          onPick={onPick}
          pickAs={pickAs}
        />
      )}
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
  scope: CatalogScope = 'films',
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
        const found =
          scope === 'films' ? searchFilms(text) : searchCatalog(text, scope)
        found.then(land, () => land({ query: text, refused: 'indisponivel' }))
      },
      IMDB_ID.test(text) ? 0 : DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [on, query, scope])

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
        <LookupField
          name={name}
          label={label}
          query={query}
          live={live}
          searching={searching}
          onType={(text) => {
            setQuery(text)
            onType?.()
          }}
        />
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

/** The lookup's field, with "buscando" in it while a search runs. With
 * the JavaScript, Enter sends nothing. */
function LookupField({
  name,
  label,
  query,
  live,
  searching,
  onType,
}: {
  name: string
  label: string
  query: string
  live: boolean
  searching: boolean
  onType: (text: string) => void
}) {
  return (
    <FieldLabel label={label}>
      <span className="relative flex">
        <input
          type="search"
          name={name}
          value={query}
          onChange={(event) => onType(event.target.value)}
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
  )
}

/** A film "Parecido com" took: its id, and its title once known. */
export type ChosenFilm = { readonly id: string; readonly label?: string }

/** Looks up by id the titles of the films that came without one. */
function useFilmLabels(
  films: readonly ChosenFilm[],
  onLabel: (id: string, label: string) => void,
) {
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
}

/** A film "Parecido com" took, with its × to let it go. */
function ChosenChip({
  film,
  onRemove,
}: {
  film: ChosenFilm
  onRemove: (id: string) => void
}) {
  const label = film.label ?? film.id
  return (
    <li className="flex items-center gap-xs rounded-pill border border-rule bg-surface-2 py-1 pr-1 pl-3">
      <span>{label}</span>
      <button
        type="button"
        aria-label={CATALOG_SEARCH.remove(label)}
        onClick={() => onRemove(film.id)}
        className="flex size-touch cursor-pointer items-center justify-center rounded-pill text-ink-2"
      >
        {/* The drawn +, turned into a ×, as the folds' close. */}
        <Icon name="plus" className="size-[16px] rotate-45" />
      </button>
    </li>
  )
}

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
  useFilmLabels(films, onLabel)
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
            <ChosenChip key={film.id} film={film} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  )
}
