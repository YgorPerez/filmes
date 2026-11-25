import type {
  BillboardFilm,
  BillboardLine,
  BillboardPerson,
} from '@filmes/engine'
import type { ReactNode } from 'react'
import type { FilmMarks } from './billboard-marks'
import { BILLBOARD } from './billboard.copy'

// One film of the Cartaz: the poster with a dot per Presente, the header,
// "Por que cada um vai gostar" and, while the Session takes a reply, the
// marks (Já vi per Presente with her Nota and what she thought, Trocar,
// stars, comment). The state is the Cartaz's (`billboard.tsx`).

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
const colorOf = (person: BillboardPerson, hollow: boolean) =>
  (hollow ? HOLLOW : FILLED)[(person.color - 1) % FILLED.length]

/** A Presente's initial in her colour; hollow when she has no Fato. */
export function Avatar({
  person,
  hollow = false,
}: {
  person: BillboardPerson
  hollow?: boolean
}) {
  return (
    <span
      title={person.name}
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
        hollow ? 'bg-transparent' : 'text-on-person'
      } ${colorOf(person, hollow)}`}
    >
      {person.initial}
    </span>
  )
}

const byslug = (people: readonly BillboardPerson[]) =>
  new Map(people.map((p) => [p.slug, p]))

const namesOf = (people: readonly BillboardPerson[]) =>
  people.map((p) => p.name).join(', ')

function Poster({
  film,
  people,
  first,
  stamp,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  first: boolean
  stamp: string | null
}) {
  const { card } = BILLBOARD
  const without = new Set(film.withoutFact)
  return (
    <a
      href={film.imdbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative grid aspect-[2/3] w-[104px] shrink-0 place-items-center self-start overflow-hidden rounded-poster bg-surface-2 p-2.5 text-center text-meta text-ink-2 no-underline sm:w-[160px]"
    >
      {film.poster ? (
        <img
          src={film.poster}
          alt={card.poster(film.title)}
          loading={first ? 'eager' : 'lazy'}
          className="absolute inset-0 size-full object-cover group-data-swap/card:opacity-72"
        />
      ) : (
        <span>{film.title}</span>
      )}
      {stamp && (
        <span
          className={`absolute top-[38%] left-1/2 -translate-x-1/2 -rotate-4 rounded-stamp border-2 bg-surface px-2 pt-[5px] pb-1 font-letter text-[15px] leading-none tracking-[0.06em] uppercase ${
            stamp === card.swapStamp
              ? 'border-marquee-red-text text-marquee-red-text'
              : 'border-ink text-ink'
          }`}
        >
          {stamp}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex justify-center gap-xs bg-linear-to-b from-transparent to-black/70 pt-4 pb-2">
        {people.map((p) => {
          const hollow = without.has(p.slug)
          return (
            <span
              key={p.slug}
              title={hollow ? card.noFact(p.name) : p.name}
              className={`size-3 rounded-full border-2 ${
                hollow ? 'bg-black/35' : ''
              } ${colorOf(p, hollow)}`}
            />
          )
        })}
      </span>
    </a>
  )
}

function Header({ film, id }: { film: BillboardFilm; id: string }) {
  const { card } = BILLBOARD
  return (
    <div className="flex min-w-0 flex-col gap-sm group-data-swap/card:opacity-72">
      <h2
        id={id}
        className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-title"
      >
        <span className="font-letter text-position text-marquee-red-text">
          {film.position}
        </span>
        <span>{film.title}</span>
        {film.originalTitle && (
          <span className="text-meta text-ink-2 italic">
            {film.originalTitle}
          </span>
        )}
        {film.new && (
          <span className="self-center rounded-pill bg-bulb px-2 py-1 text-[11px] leading-none font-bold tracking-[0.05em] text-[#141414] uppercase">
            {card.isNew}
          </span>
        )}
      </h2>
      {film.synopsis && (
        <p className="text-[15.5px] leading-normal text-pretty">
          {film.synopsis}
        </p>
      )}
      <div className="flex flex-wrap gap-xs">
        {film.chips.map((chip) => (
          <span
            key={chip}
            className="rounded-pill bg-surface-2 px-[9px] py-[3px] text-[12px]"
          >
            {chip}
          </span>
        ))}
        <a
          href={film.imdbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-pill border border-rule px-[9px] py-[3px] text-[12px] font-semibold text-ink no-underline"
        >
          {card.imdb(film.imdbRatingText, film.votesText)}
        </a>
      </div>
    </div>
  )
}

function Line({
  line,
  people,
}: {
  line: BillboardLine
  people: ReadonlyMap<string, BillboardPerson>
}) {
  const who = line.people.flatMap((slug) => people.get(slug) ?? [])
  const strength = BILLBOARD.strength[line.strength]
  return (
    <li className="grid grid-cols-[auto_32px_1fr] gap-sm text-[14px] leading-[1.45]">
      <span aria-label={namesOf(who)} className="flex -space-x-1.5">
        {who.map((p) => (
          <Avatar key={p.slug} person={p} />
        ))}
      </span>
      <span
        aria-label={BILLBOARD.strengthLabel(strength.name)}
        className="pt-1 text-[11px] tracking-[1px] whitespace-nowrap"
      >
        <span aria-hidden="true">{strength.mark}</span>
      </span>
      <span>
        {line.text}
        {line.source && (
          <span className="block text-[12px] text-ink-2">{line.source}</span>
        )}
      </span>
    </li>
  )
}

function Why({
  film,
  people,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
}) {
  const { card } = BILLBOARD
  const known = byslug(people)
  const without = film.withoutFact.flatMap((slug) => known.get(slug) ?? [])
  return (
    <div className="flex flex-col gap-sm border-t border-rule pt-3">
      <h3 className="flex justify-between gap-sm text-label text-ink-2 uppercase">
        {card.why}
        <span className="tracking-normal normal-case">{film.coverage}</span>
      </h3>
      <ul className="flex flex-col gap-[9px]">
        {film.lines.map((line) => (
          <Line
            key={`${line.people.join(' ')}:${line.text}`}
            line={line}
            people={known}
          />
        ))}
        {without.length > 0 && (
          <li className="grid grid-cols-[auto_32px_1fr] gap-sm text-[14px] leading-[1.45] text-ink-2">
            <span aria-label={namesOf(without)} className="flex -space-x-1.5">
              {without.map((p) => (
                <Avatar key={p.slug} person={p} hollow />
              ))}
            </span>
            <span />
            <span>{card.withoutFact(namesOf(without))}</span>
          </li>
        )}
      </ul>
    </div>
  )
}

const toggle =
  'relative inline-flex min-h-touch cursor-pointer items-center gap-xs rounded-pill border border-rule bg-surface px-[14px] text-[14px] has-checked:border-2 has-checked:border-ink has-checked:bg-surface-2 has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink'

/** A toggle pill: a checkbox, with a ✓ once it is on. */
function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label className={toggle}>
      {/* Over the whole pill: a tap anywhere on it is on the box. */}
      <input
        type="checkbox"
        className="absolute inset-0 cursor-pointer appearance-none rounded-pill focus-visible:outline-none"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {checked && <span aria-hidden="true">✓</span>}
      {children}
    </label>
  )
}

const field =
  'min-h-touch rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink'

/** Her Nota and what she thought, once she marked Já vi. */
function SeenDetail({
  person,
  position,
  marks,
  onChange,
}: {
  person: BillboardPerson
  position: number
  marks: FilmMarks
  onChange: (marks: FilmMarks) => void
}) {
  const { marks: copy } = BILLBOARD
  const who = person.owner ? 'você' : person.name
  return (
    <div className="flex flex-wrap items-center gap-sm">
      <span className="min-w-12 text-[14px] font-semibold">{person.label}</span>
      <input
        type="number"
        min={1}
        max={10}
        step={1}
        inputMode="numeric"
        placeholder={copy.rating}
        aria-label={copy.ratingLabel(who, position)}
        value={marks.ratings[person.slug] ?? ''}
        onChange={(e) =>
          onChange({
            ...marks,
            ratings: { ...marks.ratings, [person.slug]: e.target.value },
          })
        }
        className={`${field} w-24`}
      />
      <textarea
        rows={1}
        placeholder={copy.thought}
        aria-label={copy.thoughtLabel(who, position)}
        value={marks.thoughts[person.slug] ?? ''}
        onChange={(e) =>
          onChange({
            ...marks,
            thoughts: { ...marks.thoughts, [person.slug]: e.target.value },
          })
        }
        className={`${field} min-w-0 flex-1 basis-[180px]`}
      />
    </div>
  )
}

function Stars({
  stars,
  onChange,
}: {
  stars: number
  onChange: (stars: number) => void
}) {
  const { marks: copy } = BILLBOARD
  return (
    <div
      role="group"
      aria-label={copy.stars}
      className="inline-flex text-[24px] leading-[44px]"
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          aria-label={copy.star(value)}
          aria-pressed={stars === value}
          // The same star again takes the stars off.
          onClick={() => onChange(stars === value ? 0 : value)}
          className={`min-h-touch cursor-pointer px-[3px] ${
            value <= stars ? 'text-star' : 'text-ink-2 opacity-45'
          }`}
        >
          <span aria-hidden="true">★</span>
        </button>
      ))}
    </div>
  )
}

/** The marks of one film. */
function Marks({
  film,
  people,
  marks,
  onChange,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  marks: FilmMarks
  onChange: (marks: FilmMarks) => void
}) {
  const { marks: copy } = BILLBOARD
  const seen = new Set(marks.seen)
  const mark = (slug: string, on: boolean) => {
    const next = new Set(seen)
    if (on) next.add(slug)
    else next.delete(slug)
    onChange({
      ...marks,
      seen: people.map((p) => p.slug).filter((s) => next.has(s)),
    })
  }
  return (
    <div className="flex flex-col gap-sm border-t border-rule pt-3">
      <div
        role="group"
        aria-label={copy.seenGroup(film.position)}
        className="flex flex-wrap items-center gap-sm"
      >
        <span className="text-label text-ink-2 uppercase">{copy.seen}</span>
        {people.map((p) => (
          <Toggle
            key={p.slug}
            checked={seen.has(p.slug)}
            onChange={(on) => mark(p.slug, on)}
          >
            {p.label}
          </Toggle>
        ))}
        {people.length > 1 && (
          <Toggle
            checked={seen.size === people.length}
            onChange={(on) =>
              onChange({ ...marks, seen: on ? people.map((p) => p.slug) : [] })
            }
          >
            {copy.all}
          </Toggle>
        )}
      </div>
      {people
        .filter((p) => seen.has(p.slug))
        .map((p) => (
          <SeenDetail
            key={p.slug}
            person={p}
            position={film.position}
            marks={marks}
            onChange={onChange}
          />
        ))}
      <div className="flex flex-wrap items-center gap-sm">
        <Toggle
          checked={marks.swap}
          onChange={(swap) => onChange({ ...marks, swap })}
        >
          {copy.swap}
        </Toggle>
        <Stars
          stars={marks.stars}
          onChange={(stars) => onChange({ ...marks, stars })}
        />
      </div>
      <textarea
        rows={1}
        placeholder={copy.comment}
        aria-label={copy.commentLabel(film.position)}
        value={marks.comment}
        onChange={(e) => onChange({ ...marks, comment: e.target.value })}
        className={field}
      />
    </div>
  )
}

/** A film of the Cartaz. `marks` and `onChange` are absent when the
 * Session takes no reply (it has its Feedback). */
export function BillboardCard({
  film,
  people,
  first,
  marks,
  onChange,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  first: boolean
  marks?: FilmMarks
  onChange?: (marks: FilmMarks) => void
}) {
  const { card } = BILLBOARD
  const allSeen =
    marks !== undefined &&
    people.length > 0 &&
    marks.seen.length === people.length
  const stamp = marks?.swap ? card.swapStamp : allSeen ? card.seenStamp : null
  return (
    <article
      aria-labelledby={`filme-${film.id}`}
      data-swap={marks?.swap || undefined}
      className="group/card flex flex-col gap-md rounded-card border border-rule bg-surface p-md sm:p-lg"
    >
      <div className="flex gap-md">
        <Poster film={film} people={people} first={first} stamp={stamp} />
        <Header film={film} id={`filme-${film.id}`} />
      </div>
      <Why film={film} people={people} />
      {marks && onChange && (
        <Marks film={film} people={people} marks={marks} onChange={onChange} />
      )}
    </article>
  )
}
