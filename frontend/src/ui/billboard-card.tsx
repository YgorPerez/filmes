import { FIELD } from './kit/field'
import type {
  BillboardFilm,
  BillboardLine,
  BillboardPerson,
} from '@filmes/engine'
import type { ReactNode } from 'react'
import type { FilmMarks } from './billboard-marks'
import { Chip } from './kit/chip'
import { Avatar, PersonDot } from './kit/person'
import { PriceSticker, Sticker } from './kit/sticker'
import { TapeCase } from './kit/tape-case'
import { BILLBOARD } from './billboard.copy'

// One film of the Cartaz: the poster with a dot per Presente, the header,
// "Por que cada um vai gostar" and, while the Session takes a reply, the
// marks (Já vi per Presente with her Nota and what she thought, Trocar,
// stars, comment). The state is the Cartaz's (`billboard.tsx`).

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
  stamp: 'swap' | 'seen' | null
}) {
  const { card } = BILLBOARD
  const without = new Set(film.withoutFact)
  return (
    <a
      href={film.imdbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative shrink-0 self-start no-underline"
    >
      <TapeCase
        className="w-[112px] sm:w-[160px]"
        cover={
          film.poster ? (
            <img
              src={film.poster}
              alt={card.poster(film.title)}
              loading={first ? 'eager' : 'lazy'}
              className="absolute inset-0 size-full object-cover group-data-swap/card:opacity-70"
            />
          ) : (
            <span>{film.title}</span>
          )
        }
      >
        {people.map((p) => {
          const hollow = without.has(p.slug)
          return (
            <PersonDot
              key={p.slug}
              person={p}
              hollow={hollow}
              title={hollow ? card.noFact(p.name) : p.name}
            />
          )
        })}
      </TapeCase>
      {stamp && (
        <Sticker
          kind={stamp}
          className="absolute top-[40%] left-1/2 -translate-x-1/2"
        >
          {stamp === 'swap' ? card.swapStamp : card.seenStamp}
        </Sticker>
      )}
      {film.new && (
        <Sticker kind="new" className="absolute -top-sm -right-md">
          {card.isNew}
        </Sticker>
      )}
      <PriceSticker className="absolute -top-[9px] -left-[9px]">
        {film.position}
      </PriceSticker>
    </a>
  )
}

function Header({ film, id }: { film: BillboardFilm; id: string }) {
  const { card } = BILLBOARD
  return (
    <div className="flex min-w-0 flex-col gap-sm">
      <h2 id={id} className="flex flex-col gap-y-0.5 font-display text-title">
        <span className="sr-only">{film.position}</span>
        <span>{film.title}</span>
        {film.originalTitle && (
          <span className="font-body text-meta text-ink-2">
            {film.originalTitle}
          </span>
        )}
      </h2>
      {film.synopsis && (
        <p className="max-w-[60ch] text-synopsis text-pretty">
          {film.synopsis}
        </p>
      )}
      <div className="flex flex-wrap gap-xs">
        {film.chips.map((chip) => (
          <Chip key={chip}>{chip}</Chip>
        ))}
        <a
          href={film.imdbUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-pill border-[1.5px] border-rule px-[9px] py-[5px] font-display text-chip font-bold text-ink no-underline"
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
      <h3 className="flex justify-between gap-sm font-display text-label text-ink-2 uppercase">
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
  'relative inline-flex min-h-touch cursor-pointer items-center gap-xs rounded-pill border-[1.5px] border-rule bg-surface px-xl font-display text-control has-checked:border-2 has-checked:border-ink has-checked:bg-surface-2 has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus'

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

const field = FIELD

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
        <span className="font-display text-label text-ink-2 uppercase">
          {copy.seen}
        </span>
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
  const allSeen =
    marks !== undefined &&
    people.length > 0 &&
    marks.seen.length === people.length
  const stamp = marks?.swap ? 'swap' : allSeen ? 'seen' : null
  return (
    <article
      aria-labelledby={`filme-${film.id}`}
      data-swap={marks?.swap || undefined}
      className="group/card flex flex-col gap-xl rounded-card border border-rule bg-surface p-xl sm:p-2xl"
    >
      <div className="flex gap-xl">
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
