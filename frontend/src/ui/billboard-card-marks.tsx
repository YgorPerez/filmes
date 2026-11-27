import type { BillboardFilm, BillboardPerson } from '@filmes/engine'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BILLBOARD } from './billboard.copy'
import { settleSwap, swapReasons, type FilmMarks } from './billboard-marks'
import { Icon } from './billboard-icons'
import { buttonVariants } from './kit/button-variants'
import { FIELD } from './kit/field'
import { MarkText, PRESSED_PILL } from './kit/option'
import { Avatar } from './kit/person'

// The marks of one film of the Cartaz (DESIGN.md, Opções, Escala de nota,
// Estrelas): Trocar and the stars on one line; Já vi per Presente and
// "Todos", each Já vi opening her note (the 1 to 10 scale and what she
// thought) on the blue card stock; last Comentar, whose field opens in its
// place, so a card carries no empty field. The Trocar turns on by itself
// with a Já vi under Sem Já visto and with 1 to 3 stars, and a line under
// the buttons says why; once the Dono presses it, it is hers (#326).

/** An option that stays pressed, with the ✓ before the word, the same
 * width pressed or not (`kit/option.tsx`): pressing never wraps the row. */
function Toggle({
  pressed,
  onChange,
  compact = false,
  children,
}: {
  pressed: boolean
  onChange: (pressed: boolean) => void
  /** The Já vi row's tighter pill, the same 32px of room for the ✓: three
   * Presentes and Todos fit one line of a phone (#272). */
  compact?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={buttonVariants({
        variant: 'option',
        className: compact
          ? 'gap-2xs px-2xl aria-pressed:px-1.5'
          : `gap-sm ${PRESSED_PILL}`,
      })}
    >
      {pressed && <Icon name="check" className="size-4 shrink-0" />}
      <MarkText>{children}</MarkText>
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
    <div
      role="group"
      aria-label={label}
      // Two rows of 5 until the note itself is wide enough for ten
      // 44px cells (#277): the width of the note, not of the window.
      className="grid grid-cols-5 gap-0.75 @min-[470px]:grid-cols-10"
    >
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
    <div className="@container flex flex-col gap-sm rounded-field bg-card-stock px-lg py-md text-card-stock-ink">
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
        placeholder={copy.thought(who)}
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

/** Five stars. Those the Dono gave in an earlier version show until she
 * gives others (#272): the card never shows the stars twice. */
function Stars({
  stars,
  before,
  onChange,
}: {
  stars: number
  before: number
  onChange: (stars: number) => void
}) {
  const { marks: copy } = BILLBOARD
  const shown = stars > 0 ? stars : before
  return (
    <div role="group" aria-label={copy.stars} className="inline-flex">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          type="button"
          aria-label={copy.star(value)}
          aria-pressed={shown === value}
          // The same star again takes the stars off.
          onClick={() => onChange(stars === value ? 0 : value)}
          className={`grid size-touch cursor-pointer place-items-center ${
            value <= shown ? 'text-star [&_svg]:fill-current' : 'text-ink-2/45'
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

/** The marks of one film: Trocar and the stars on one line, the reason
 * of a Trocar the Cartaz turned on, then Já vi per Presente with each
 * one's note, and last Comentar, where the comment opens. */
export function FilmMarksControls({
  film,
  people,
  marks,
  unseen = false,
  onChange: change,
}: {
  film: BillboardFilm
  people: readonly BillboardPerson[]
  marks: FilmMarks
  /** The Session asked Sem Já visto: a Já vi turns the Trocar on. */
  unseen?: boolean
  onChange: (marks: FilmMarks) => void
}) {
  const { marks: copy } = BILLBOARD
  const onChange = (next: FilmMarks) => change(settleSwap(next, unseen))
  const why = swapReasons(marks, unseen)
  const seenBy = new Set(why.seen)
  const names = people
    .filter((p) => seenBy.has(p.slug))
    .map((p) => (p.owner ? null : p.name))
  const [opened, setOpened] = useState(false)
  const commenting = opened || marks.comment !== ''
  const seen = new Set(marks.seen)
  // Many Presentes make a long row of Já vi: it opens from one option,
  // and stays open once someone is marked (#277).
  const [unfolded, setUnfolded] = useState(false)
  const folded = people.length > copy.seenFolded && !unfolded && seen.size === 0
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
          onChange={(swap) => onChange({ ...marks, swap, swapByHand: true })}
        >
          {copy.swap}
        </Toggle>
        <Stars
          stars={marks.stars}
          before={film.notes?.stars ?? 0}
          onChange={(stars) => onChange({ ...marks, stars })}
        />
      </div>
      {marks.swap && (names.length > 0 || why.stars !== null) && (
        <p className="-mt-xs text-meta text-ink-2">
          {copy.swapWhy(names, why.stars)}
        </p>
      )}
      <div
        role="group"
        aria-label={copy.seenGroup(film.position)}
        className="flex flex-wrap items-center gap-x-xs gap-y-sm"
      >
        {folded ? (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => setUnfolded(true)}
            className={buttonVariants({ variant: 'option' })}
          >
            {copy.seenMore}
          </button>
        ) : (
          <span className={`${label} mr-2xs`}>{copy.seen}</span>
        )}
        {!folded &&
          people.map((p) => (
            <Toggle
              key={p.slug}
              compact
              pressed={seen.has(p.slug)}
              onChange={(on) => mark(p.slug, on)}
            >
              {p.label}
            </Toggle>
          ))}
        {!folded && people.length > 1 && (
          <Toggle
            compact
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
      {!commenting && (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOpened(true)}
          className={buttonVariants({
            variant: 'link',
            className: 'self-start',
          })}
        >
          {copy.openComment}
        </button>
      )}
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
