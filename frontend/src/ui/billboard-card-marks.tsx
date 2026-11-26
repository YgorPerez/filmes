import type { BillboardFilm, BillboardPerson } from '@filmes/engine'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BILLBOARD } from './billboard.copy'
import type { FilmMarks } from './billboard-marks'
import { Icon } from './billboard-icons'
import { buttonVariants } from './kit/button-variants'
import { FIELD } from './kit/field'
import { Avatar } from './kit/person'

// The marks of one film of the Cartaz (DESIGN.md, Opções, Escala de nota,
// Estrelas): Trocar, the stars and Comentar on one line; Já vi per
// Presente and "Todos", each Já vi opening her note (the 1 to 10 scale and
// what she thought) on the blue card stock. The comment's field opens from
// Comentar, so a card carries no empty field.

/** An option that stays pressed, with the ✓ before the word. */
function Toggle({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean
  onChange: (pressed: boolean) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={buttonVariants({ variant: 'option', className: 'gap-xs' })}
    >
      {pressed && <Icon name="check" />}
      {children}
    </button>
  )
}

/** Ten buttons; the chosen one is the orange circle. The same again takes
 * the Nota off. */
function Scale({
  value,
  label,
  onChange,
}: {
  value: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-10 gap-0.75">
      {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? '' : n)}
          className="group grid h-touch min-w-0 cursor-pointer place-items-center rounded-rail bg-surface p-0 font-display text-field-label text-ink tabular-nums aria-pressed:bg-transparent"
        >
          <span className="grid size-7 place-items-center rounded-round group-aria-pressed:bg-sticker-orange group-aria-pressed:text-on-sticker">
            {n}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Her Nota and what she thought, once she marked Já vi. */
function SeenNote({
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
    <div className="flex flex-col gap-sm rounded-field bg-card-stock px-lg py-md text-card-stock-ink">
      <span className="flex items-center gap-sm font-display text-field-label">
        <Avatar person={person} />
        {copy.note(person.owner ? null : person.name)}
      </span>
      <Scale
        label={copy.ratingLabel(who, position)}
        value={marks.ratings[person.slug] ?? ''}
        onChange={(rating) =>
          onChange({
            ...marks,
            ratings: { ...marks.ratings, [person.slug]: rating },
          })
        }
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
        className={FIELD}
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
    <div role="group" aria-label={copy.stars} className="inline-flex">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          aria-label={copy.star(value)}
          aria-pressed={stars === value}
          // The same star again takes the stars off.
          onClick={() => onChange(stars === value ? 0 : value)}
          className={`grid h-touch w-9 cursor-pointer place-items-center ${
            value <= stars ? 'text-star [&_svg]:fill-current' : 'text-ink-2/45'
          }`}
        >
          <Icon name="star" className="size-6" />
        </button>
      ))}
    </div>
  )
}

const label = 'font-display text-label text-ink-2 uppercase'

/** The comment's field, at the end of the card's marks; opened by a tap
 * on Comentar it takes the typing. */
function Comment({
  position,
  comment,
  opened,
  onChange,
}: {
  position: number
  comment: string
  opened: boolean
  onChange: (comment: string) => void
}) {
  const { marks: copy } = BILLBOARD
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (opened) field.current?.focus()
  }, [opened])
  return (
    <textarea
      ref={field}
      rows={1}
      placeholder={copy.comment}
      aria-label={copy.commentLabel(position)}
      value={comment}
      onChange={(e) => onChange(e.target.value)}
      className={FIELD}
    />
  )
}

/** The marks of one film: Trocar, the stars and Comentar on one line
 * (it wraps on a phone), then Já vi per Presente with each one's note,
 * and the comment once Comentar opened it or it has text. */
export function FilmMarksControls({
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
  const [opened, setOpened] = useState(false)
  const commenting = opened || marks.comment !== ''
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
    <div className="col-span-2 flex flex-col gap-sm border-t border-dashed border-rule pt-lg">
      <div className="flex flex-wrap items-center gap-x-sm">
        <Toggle
          pressed={marks.swap}
          onChange={(swap) => onChange({ ...marks, swap })}
        >
          {copy.swap}
        </Toggle>
        <Stars
          stars={marks.stars}
          onChange={(stars) => onChange({ ...marks, stars })}
        />
        {!commenting && (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setOpened(true)}
            className={buttonVariants({ variant: 'link' })}
          >
            {copy.openComment}
          </button>
        )}
      </div>
      <div
        role="group"
        aria-label={copy.seenGroup(film.position)}
        className="flex flex-wrap items-center gap-sm"
      >
        <span className={label}>{copy.seen}</span>
        {people.map((p) => (
          <Toggle
            key={p.slug}
            pressed={seen.has(p.slug)}
            onChange={(on) => mark(p.slug, on)}
          >
            {p.label}
          </Toggle>
        ))}
        {people.length > 1 && (
          <Toggle
            pressed={seen.size === people.length}
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
          <SeenNote
            key={p.slug}
            person={p}
            position={film.position}
            marks={marks}
            onChange={onChange}
          />
        ))}
      {commenting && (
        <Comment
          position={film.position}
          comment={marks.comment}
          opened={opened}
          onChange={(comment) => onChange({ ...marks, comment })}
        />
      )}
    </div>
  )
}
