// A Presente's colour (DESIGN.md, Avatares; The One Color Per Person Rule):
// one per Presente by her order in the Session, the same in the dot under
// the cover, the avatar of an Evidência and the legend, always with her
// initial or name beside it. Hollow (a ring in her colour) is the Presente
// without a Fato.

/** What a colour needs to know of a Presente. */
interface Person {
  /** Her order in the Session, from 1. */
  readonly color: number
  readonly initial: string
  readonly name: string
}

// One class list per person colour, written out so Tailwind finds them.
const FILLED = [
  'bg-person-1 border-person-1',
  'bg-person-2 border-person-2',
  'bg-person-3 border-person-3',
  'bg-person-4 border-person-4',
  'bg-person-5 border-person-5',
  'bg-person-6 border-person-6',
]
const HOLLOW = [
  'border-person-1 text-person-1',
  'border-person-2 text-person-2',
  'border-person-3 text-person-3',
  'border-person-4 text-person-4',
  'border-person-5 text-person-5',
  'border-person-6 text-person-6',
]
const colorOf = (person: Person, hollow: boolean) =>
  (hollow ? HOLLOW : FILLED)[(person.color - 1) % FILLED.length]

/** A Presente's initial in her colour, 24px; hollow when she has no Fato. */
export function Avatar({
  person,
  hollow = false,
}: {
  person: Person
  hollow?: boolean
}) {
  return (
    <span
      title={person.name}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-round border-2 font-display text-[11px] font-bold ${
        hollow ? 'bg-transparent' : 'text-on-person'
      } ${colorOf(person, hollow)}`}
    >
      {person.initial}
    </span>
  )
}

/** Her 12px dot on the case, under the cover; `title` says who it is. */
export function PersonDot({
  person,
  hollow = false,
  title,
}: {
  person: Person
  hollow?: boolean
  title: string
}) {
  return (
    <span
      title={title}
      className={`size-3 rounded-round border-2 ${hollow ? 'bg-transparent' : ''} ${colorOf(person, hollow)}`}
    />
  )
}
