import type { EntityMatch, FilmMatch, FilmRef } from '@filmes/engine'
import type { ComponentProps, ReactNode } from 'react'
import type { CatalogScope } from '#/content/catalog-search'
import type { SearchAnswer } from '#/platform/catalog-search'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { PERSON } from './person.copy'
import { Button, buttonVariants } from './shadcn/button'

// The pieces the Pessoas screens share, and the other Dono screens with
// them: the alert and the notice, the Dono tag, a section's card, the
// fields, the forms that post an action and their submit button.

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex gap-sm rounded-field border border-marquee-red-text px-3 py-2.5 text-marquee-red-text"
    >
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </p>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-field border border-rule bg-surface-2 px-3 py-2.5"
    >
      {children}
    </p>
  )
}

/** A form's submit button with every Button prop (`disabled`...);
 * `Submit` is the plain one. */
export const SubmitButton = (
  props: Omit<ComponentProps<typeof Button>, 'type'>,
) => <Button type="submit" {...props} />

export function OwnerTag() {
  return (
    <span className="rounded-pill border border-rule px-2 py-0.5 text-label text-ink-2 uppercase">
      {PERSON.owner}
    </span>
  )
}

/** A section of the Pessoa's page: a card with its title. */
export function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string
  title: string
  lead?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-md rounded-card border border-rule bg-surface p-md"
    >
      <div className="flex flex-col gap-xs">
        <h2 id={id} className="text-title">
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

/** A form that posts one action to the Pessoa's route
 * (`platform/people.ts`). A plain POST: it works before the JavaScript. */
export function ActionForm({
  slug,
  action,
  label,
  className,
  children,
}: {
  slug: string
  action: string
  label?: string
  className?: string
  children: ReactNode
}) {
  return (
    <form
      method="post"
      action={`/pessoas/${encodeURIComponent(slug)}/acao`}
      aria-label={label}
      className={className ?? 'flex flex-col gap-md'}
    >
      <input type="hidden" name="acao" value={action} />
      {children}
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
    <ActionForm slug={slug} action="remover" className="shrink-0">
      <input type="hidden" name="tipo" value={what} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="quiet"
        aria-label={PERSON.removeLabel(label)}
      >
        {PERSON.remove}
      </Button>
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
    <details open={open} className="group rounded-field border border-rule">
      <summary className="flex min-h-touch cursor-pointer items-center px-3 font-semibold select-none">
        {summary}
      </summary>
      <div className="border-t border-rule p-md">{children}</div>
    </details>
  )
}

const control =
  'min-h-touch w-full rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink'

function Label({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="text-[14px] font-semibold">
        {label}
        {hint && (
          <>
            {' '}
            <span className="font-normal text-ink-2">{hint}</span>
          </>
        )}
      </span>
      {children}
    </label>
  )
}

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
  return (
    <Label label={label} hint={hint}>
      <input
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
    </Label>
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
  return (
    <Label label={label} hint={hint}>
      <select name={name} defaultValue={defaultValue} className={control}>
        {options.map(({ value, label: text }) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </Label>
  )
}

/** The submit of a form, quiet unless `variant` says otherwise. */
export function Submit({
  variant = 'quiet',
  children,
}: {
  variant?: 'primary' | 'quiet'
  children: ReactNode
}) {
  return (
    <Button type="submit" variant={variant} className="self-start">
      {children}
    </Button>
  )
}

/** A link that looks like a button: `primary` for the screen's main
 * action, `quiet` for the others. */
export function LinkButton({
  href,
  variant = 'quiet',
  label,
  children,
}: {
  href: string
  variant?: 'primary' | 'quiet'
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

function FilmItem({
  film,
  pick,
}: {
  film: FilmMatch
  pick?: (id: string) => string
}) {
  const { votes, pickLabel } = CATALOG_SEARCH
  const title = filmText(film)
  return (
    <Item
      actions={
        pick && (
          <LinkButton href={pick(film.id)} label={pickLabel(title)}>
            {CATALOG_SEARCH.pick}
          </LinkButton>
        )
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
      <h3 className="text-label text-ink-2 uppercase">{title}</h3>
      <ul className="flex flex-col">{children}</ul>
    </div>
  )
}

function Results({
  answer,
  pick,
}: {
  answer: SearchAnswer
  pick?: (id: string) => string
}) {
  const { groups, results, none, refusals } = CATALOG_SEARCH
  if ('refused' in answer) return <Alert>{refusals[answer.refused]}</Alert>
  const { films, people, genres, series } = answer.found
  const entities = (list: readonly EntityMatch[]) =>
    list.map((e) => <EntityItem key={e.id} entity={e} />)
  const empty =
    films.length + people.length + genres.length + series.length === 0
  return (
    <div className="flex flex-col gap-md" aria-label={results(answer.query)}>
      <p className="text-meta text-ink-2" role="status">
        {empty ? none : results(answer.query)}
      </p>
      <Group title={groups.films}>
        {films.map((f) => (
          <FilmItem key={f.id} film={f} pick={pick} />
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
        className="flex flex-wrap items-end gap-sm"
      >
        {Object.entries(keep).map(
          ([name, value]) =>
            value !== undefined && (
              <input key={name} type="hidden" name={name} value={value} />
            ),
        )}
        <label className="flex min-w-0 flex-1 basis-[220px] flex-col gap-xs">
          <span className="text-[14px] font-semibold">
            {label} <span className="font-normal text-ink-2">{hint}</span>
          </span>
          <input
            type="search"
            name="buscar"
            defaultValue={answer?.query}
            required
            autoComplete="off"
            className="min-h-touch w-full rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink"
          />
        </label>
        <SubmitButton variant="quiet">{submit}</SubmitButton>
      </form>
      {answer && <Results answer={answer} pick={pick} />}
    </Section>
  )
}
