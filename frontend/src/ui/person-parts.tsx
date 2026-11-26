import type { EntityMatch, FilmMatch, FilmRef } from '@filmes/engine'
import type { ComponentProps, ReactNode } from 'react'
import type { CatalogScope } from '#/content/catalog-search'
import type { SearchAnswer } from '#/platform/catalog-search'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { PERSON } from './person.copy'
import { FIELD } from './kit/field'
import { FieldLabel } from './kit/field-label'
import { Icon } from './kit/icon'
import { Alert, Notice } from './kit/status'
import { buttonVariants } from './kit/button-variants'
import { Button } from './shadcn/button'

// The pieces the Pessoas screens share, and the other Dono screens with
// them: the alert and the notice, a section's card, the fields, the forms
// that post an action and their submit button. The alert and the notice
// are kit/status's; these screens take them from here with the rest of
// their parts, which keeps kit/status under fallow's coupling threshold
// (its fan-in at most the project's p95).

export { Alert, Notice }

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
      className="flex flex-col gap-xl rounded-card border border-rule bg-surface p-xl"
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
      className={className ?? 'flex flex-col gap-xl'}
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
        variant="option"
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
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-sm px-3 font-semibold select-none [&::-webkit-details-marker]:hidden">
        {summary}
        {/* The drawn +, a × while open: the fold's state not by colour. */}
        <Icon
          name="plus"
          className="size-[18px] text-ink-2 transition-transform group-open:rotate-45 motion-reduce:transition-none"
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
  return (
    <FieldLabel label={label} hint={hint}>
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
  return (
    <FieldLabel label={label} hint={hint}>
      <select name={name} defaultValue={defaultValue} className={control}>
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
 * otherwise. */
export function Submit({
  variant = 'option',
  className = 'self-start',
  ...props
}: Omit<ComponentProps<typeof Button>, 'type'>) {
  return (
    <Button type="submit" variant={variant} className={className} {...props} />
  )
}

/** A link that looks like a button: `primary` for the screen's main
 * action, `option` for the others. */
export function LinkButton({
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
      <h3 className="font-display text-label text-ink-2 uppercase">{title}</h3>
      <ul className="flex flex-col">{children}</ul>
    </div>
  )
}

function CatalogResults({
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
    <div className="flex flex-col gap-xl" aria-label={results(answer.query)}>
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
            className={`${FIELD} w-full`}
          />
        </label>
        <Submit className="">{submit}</Submit>
      </form>
      {answer && <CatalogResults answer={answer} pick={pick} />}
    </Section>
  )
}

/** The Catálogo search inside a form that posts (Nova Sessão, Contar como
 * foi): its button sends the form with `buscar-catalogo=sim`, so the
 * server keeps what the form holds and comes back with the search. Enter
 * in the field searches too: the form's default button says `tecla=enter`,
 * and `buscado`, what the field came back with, tells a new search from
 * one already run (`searchAsked`). */
export function SessionFilmLookup({
  name,
  label,
  answer,
  value,
  pick,
}: {
  name: 'buscar' | 'busca'
  label: string
  answer: SearchAnswer | null
  value?: string
  pick: (id: string) => string
}) {
  return (
    <section aria-label={CATALOG_SEARCH.title} className="flex flex-col gap-lg">
      <div className="grid items-end gap-sm sm:grid-cols-[1fr_auto]">
        <FieldLabel label={label}>
          <input
            type="search"
            name={name}
            defaultValue={value ?? answer?.query}
            autoComplete="off"
            className={`${FIELD} w-full`}
          />
        </FieldLabel>
        <Submit name="buscar-catalogo" value="sim" formNoValidate>
          {CATALOG_SEARCH.submit}
        </Submit>
      </div>
      <input
        type="hidden"
        name="buscado"
        value={value ?? answer?.query ?? ''}
      />
      {answer && <CatalogResults answer={answer} pick={pick} />}
    </section>
  )
}
