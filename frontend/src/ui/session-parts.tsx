import type { ReactNode } from 'react'
import { Icon } from './kit/icon'
import { Avatar } from './kit/person'
import { RowArrow } from './kit/row-arrow'
import { ShelfLabel } from './kit/shelf-label'
import { buttonVariants } from './shadcn/button'

// The pieces the Sessões and the Feedback screens share (DESIGN.md, Locadora
// de bairro): who is in a Session, the card-stock box of a
// Session still to return ("devolver a fita"), the Label heading of a
// group, the row of a closed Session, and the Catálogo search folded away
// until it is needed.

type Named = { readonly name: string }

/** A Presente as the avatar takes her: her colour by her order in the
 * Session (The One Color Per Person Rule), her initial. */
const asPerson = (person: Named, index: number) => ({
  color: index + 1,
  initial: person.name.slice(0, 1).toUpperCase(),
  name: person.name,
})

/** The Presentes' avatars, overlapped with a ring of the surface under
 * them; decoration beside their names, so a screen reader skips them. */
export function Avatars({ people }: { people: readonly Named[] }) {
  return (
    <span aria-hidden="true" className="inline-flex shrink-0">
      {people.map((person, index) => (
        <span
          key={person.name}
          className="-ml-[7px] rounded-round ring-2 ring-surface first:ml-0"
        >
          <Avatar person={asPerson(person, index)} />
        </span>
      ))}
    </span>
  )
}

/** One Presente's avatar, in her Session's colour. */
export function PersonAvatar({
  person,
  index,
}: {
  person: Named
  index: number
}) {
  return (
    <span aria-hidden="true" className="inline-flex">
      <Avatar person={asPerson(person, index)} />
    </span>
  )
}

export const names = (people: readonly Named[]) =>
  people.map((p) => p.name).join(', ')

/** The date of a Session, as a Label: Rubik 700 12px in capitals, `ink-2`,
 * tabular. */
export function DateLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-display text-label text-ink-2 uppercase tabular-nums">
      {children}
    </span>
  )
}

/** "Falta contar como foi": the card-stock box of a Session to return, the
 * phrase in marker, what is missing in the system's 14px and the way to
 * the Feedback as an option. */
export function ReturnBox({
  title,
  text,
  href,
  label,
  action,
}: {
  title: string
  text: string
  href: string
  label: string
  action: string
}) {
  return (
    <div className="flex flex-col items-start gap-md rounded-field bg-card-stock p-lg text-card-stock-ink">
      <p className="font-hand text-[19px] leading-[1.2]">{title}</p>
      <p className="text-[14px]">{text}</p>
      <a
        href={href}
        aria-label={label}
        className={buttonVariants({ variant: 'option' })}
      >
        {action}
      </a>
    </div>
  )
}

/** A group's heading, as a Label, with its count beside it (the list says
 * it to a screen reader). */
export function GroupHeading({
  id,
  title,
  count,
}: {
  id: string
  title: string
  count?: number
}) {
  return (
    <h2
      id={id}
      className="flex items-baseline gap-sm font-display text-label text-ink-2 uppercase"
    >
      {title}
      {count !== undefined && count > 0 && (
        <span aria-hidden="true" className="font-medium tabular-nums">
          {count}
        </span>
      )}
    </h2>
  )
}

/** A row that leads to a Session, a shelf row: 52px,
 * `surface`, a 1px `rule`, 10px, with the arrow at the end. */
export function ShelfRow({
  href,
  before,
  children,
}: {
  href: string
  /** What leads the row (the Presentes' avatars). */
  before?: ReactNode
  children: ReactNode
}) {
  return (
    <li>
      <a
        href={href}
        className="flex min-h-[52px] items-center gap-lg rounded-nav-row border border-rule bg-surface px-xl py-sm text-ink no-underline"
      >
        {before}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
        <RowArrow />
      </a>
    </li>
  )
}

/** The Catálogo search, folded under a summary until it is needed; open
 * when it has an answer or the form already took a film from it. */
export function SearchFold({
  summary,
  hint,
  open,
  children,
}: {
  summary: string
  hint: string
  open: boolean
  children: ReactNode
}) {
  return (
    <details open={open} className="group flex flex-col">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-lg rounded-nav-row border-[1.5px] border-dashed border-rule px-xl py-sm select-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-control font-bold">{summary}</span>
          <span className="text-[14px] text-ink-2">{hint}</span>
        </span>
        <RowArrow className="rotate-90 group-open:-rotate-90" />
      </summary>
      <div className="pt-sm">{children}</div>
    </details>
  )
}

/** "Nova Sessão": the screen's main action, with the drawn +. */
export function NewSessionLink({ children }: { children: ReactNode }) {
  return (
    <a
      href="/sessoes/nova"
      className={buttonVariants({ className: 'self-start' })}
    >
      <Icon name="plus" className="size-[18px]" />
      {children}
    </a>
  )
}

/** The night's request: its items on the shelf label, with the Dono's
 * words on the yellow paper; with no items, the paper alone, so an empty
 * rail never shows. */
export function NightRequest({
  items,
  note,
}: {
  items: readonly string[]
  note: string | null
}) {
  if (items.length > 0) return <ShelfLabel items={items} note={note} />
  return note ? (
    <p className="-rotate-2 self-start rounded-note bg-sticker-yellow px-xl pt-[5px] pb-2xs font-hand text-hand text-on-sticker">
      {note}
    </p>
  ) : null
}
