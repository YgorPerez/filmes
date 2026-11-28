import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import type { BillboardPerson } from '@filmes/engine'
import type { VoteDeck } from '#/platform/session-votes'
import { buttonVariants } from './kit/button-variants'
import { Icon } from './kit/icon'
import { FilmSheet } from './film-sheet'
import { FilmCover } from './session-link'
import { VOTES } from './session-votes.copy'

// The Ordem (#379): after the deck, with two or more yes films, she puts her
// sim films in the order she wants them, the one she wants most first. A
// list with the tape and a handle on each row: the handle drags the row
// (pointer) or moves it with ↑ ↓ (keyboard), and a tap on the film opens
// its full sheet, where a Não is the swipe's não. Enviar votos sends the
// order as it is, so the step can be skipped.

type Film = VoteDeck['films'][number]

/** The row under `y` among `rows`, leaving out the one dragged. */
const rowAt = (
  rows: readonly (HTMLElement | null)[],
  dragged: number,
  y: number,
) =>
  rows.filter((row, i) => {
    if (i === dragged || !row) return false
    const box = row.getBoundingClientRect()
    return box.top + box.height / 2 < y
  }).length

/** The handles drag the rows by the pointer. */
function useDragRows(move: (from: number, to: number) => void) {
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const handle = (i: number) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDragging(i)
    },
    onPointerMove: (event: PointerEvent) => {
      if (dragging === null) return
      const to = rowAt(rows.current, dragging, event.clientY)
      if (to === dragging) return
      move(dragging, to)
      setDragging(to)
    },
    onPointerUp: () => setDragging(null),
    onPointerCancel: () => setDragging(null),
  })
  return { rows, dragging, handle }
}

export function VoteRanking({
  films,
  people,
  sending,
  move,
  drop,
  back,
}: {
  /** Her sim films, in her Ordem. */
  films: readonly Film[]
  people: readonly BillboardPerson[]
  sending: boolean
  move: (from: number, to: number) => void
  /** A Não from the film's sheet. */
  drop: (id: string) => void
  back: () => void
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  const { rows, dragging, handle } = useDragRows(move)
  useEffect(() => heading.current?.focus(), [])
  const sheet = films.find((f) => f.id === open)
  const onKey = (i: number) => (event: KeyboardEvent) => {
    const to =
      event.key === 'ArrowUp' ? i - 1 : event.key === 'ArrowDown' ? i + 1 : i
    if (to === i || to < 0 || to >= films.length) return
    event.preventDefault()
    move(i, to)
  }
  return (
    <>
      <div className="flex flex-col gap-xs">
        <h2
          ref={heading}
          tabIndex={-1}
          className="font-display text-step-title"
        >
          {VOTES.rankTitle}
        </h2>
        <p className="text-meta text-ink-2">
          <span className="pointer-fine:hidden">{VOTES.rankHint.touch}</span>
          <span className="hidden pointer-fine:inline">
            {VOTES.rankHint.keys}
          </span>
        </p>
      </div>
      <ol aria-label={VOTES.rankList} className="flex flex-col">
        {films.map((film, i) => (
          <li
            key={film.id}
            ref={(row) => {
              rows.current[i] = row
            }}
            className={`flex items-center gap-md border-b border-rule py-sm last:border-b-0 ${dragging === i ? 'bg-surface' : ''}`}
          >
            <button
              type="button"
              onClick={() => setOpen(film.id)}
              className="grid min-w-0 flex-1 cursor-pointer grid-cols-[48px_1fr] items-center gap-md text-left"
            >
              <FilmCover
                poster={film.card?.poster ?? null}
                title={film.title}
                small
                className="w-full"
              />
              <span className="min-w-0 font-display text-row-title text-balance">
                <span className="text-ink-2 tabular-nums">{`${i + 1}.`}</span>{' '}
                {film.title}
              </span>
            </button>
            <button
              type="button"
              aria-label={VOTES.rankMove(film.title, i + 1, films.length)}
              disabled={sending}
              onKeyDown={onKey(i)}
              {...handle(i)}
              className="grid size-touch cursor-grab touch-none place-items-center text-ink-2 hover:text-ink"
            >
              <Icon name="grip" className="size-6" />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-lg">
        <button type="submit" className={buttonVariants()} disabled={sending}>
          {sending ? VOTES.sending : VOTES.send}
        </button>
        <button
          type="button"
          onClick={back}
          disabled={sending}
          className={buttonVariants({ variant: 'link' })}
        >
          {VOTES.rankBack}
        </button>
      </div>
      {sheet && (
        <FilmSheet
          film={{
            title: sheet.title,
            originalTitle: sheet.card?.originalTitle ?? null,
            poster: sheet.card?.poster ?? null,
          }}
          sheet={sheet.sheet}
          people={people}
          onClose={() => setOpen(null)}
        >
          <div className="sticky bottom-0 flex flex-col gap-xs rounded-panel bg-case py-md">
            <button
              type="button"
              onClick={() => {
                setOpen(null)
                drop(sheet.id)
              }}
              className={buttonVariants({
                variant: 'option',
                className: 'self-center',
              })}
            >
              <Icon name="close" className="size-[18px]" />
              {VOTES.rankNo}
            </button>
            <p className="text-center text-meta text-case-ink-2">
              {VOTES.rule.noDoes}
            </p>
          </div>
        </FilmSheet>
      )}
    </>
  )
}
