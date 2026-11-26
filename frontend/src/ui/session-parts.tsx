import type { ReactNode } from 'react'
import { Icon } from './kit/icon'
import { Avatar } from './kit/person'
import { ShelfLabel } from './kit/shelf-label'
import { buttonVariants } from './kit/button-variants'

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

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function SessionDate({ date }: { date: string }) {
  const timestamp = Date.parse(date)
  return (
    <time dateTime={date}>
      {Number.isNaN(timestamp) ? date : dateFormat.format(timestamp)}
    </time>
  )
}

/** "Nova Sessão": the screen's main action, with the drawn +. */
export function NewSessionLink({ children }: { children: ReactNode }) {
  return (
    <a href="/sessoes/nova" className={buttonVariants({ variant: 'primary' })}>
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
    <p className="-rotate-2 self-start rounded-note bg-sticker-yellow px-xl pt-1.25 pb-2xs font-hand text-hand text-on-sticker">
      {note}
    </p>
  ) : null
}
