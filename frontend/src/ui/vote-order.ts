import { useEffect, useRef, useState, type RefObject } from 'react'
import type { VoteDeck } from '#/platform/session-votes'
import { VOTES } from './session-votes.copy'

// Her Ordem's state (#379), apart from the list that shows it
// (`vote-ranking.tsx`): which films are her yes films, where they start and
// where she dragged them.

type Film = VoteDeck['films'][number]

/** Where her Ordem starts: `previous` (her earlier Ordem, or the one she
 * is dragging) with only the films still in `yes`; a sim it lacks goes in
 * the middle, where the group counts a film she has not placed. With no
 * earlier Ordem, the engine's order of `yes`. */
function startingOrder(
  yes: readonly string[],
  previous: readonly string[],
): string[] {
  const wanted = new Set(yes)
  const order = previous.filter((id) => wanted.has(id))
  if (order.length === 0) return [...yes]
  const placed = new Set(order)
  for (const id of yes)
    if (!placed.has(id)) order.splice(Math.floor(order.length / 2), 0, id)
  return order
}

/** Moves the item at `from` to `to`. */
export function moved<A>(list: readonly A[], from: number, to: number): A[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  if (item !== undefined) next.splice(to, 0, item)
  return next
}

/** Her yes films in the deck's order: the deck's films she said sim to, and
 * her standing yes films she did not turn into não from the Ordem. */
function yesFilmsOf(
  deck: VoteDeck,
  films: readonly Film[],
  votes: readonly (string | undefined)[],
  standing: ReadonlySet<string>,
  undone: ReadonlySet<string>,
): Film[] {
  const cast = new Map(films.map((f, i) => [f.id, votes[i]]))
  return deck.films.filter((f) =>
    cast.has(f.id)
      ? cast.get(f.id) === 'yes'
      : standing.has(f.id) && f.mine === 'yes' && !undone.has(f.id),
  )
}

/** Her Ordem: her yes films from her earlier Ordem or the engine's order, as
 * she drags them; whether she is on it; and what the list does. Going
 * back to the recap gives `recap` the focus. */
export function useOrder({
  deck,
  films,
  votes,
  standing,
  recap,
  say,
  drop,
}: {
  deck: VoteDeck
  /** The deck's films and her Votos on them, in order. */
  films: readonly Film[]
  votes: readonly (string | undefined)[]
  /** Her standing Votos, sent again. */
  standing: readonly Film[]
  recap: RefObject<HTMLHeadingElement | null>
  say: (text: string) => void
  /** A não on one of the deck's films (its index). */
  drop: (index: number) => void
}) {
  const [ranking, setRanking] = useState(false)
  const [dragged, setDragged] = useState<string[] | null>(null)
  const [undone, setUndone] = useState<ReadonlySet<string>>(new Set())
  const left = useRef(false)
  useEffect(() => {
    if (ranking || !left.current) return
    left.current = false
    recap.current?.focus()
  }, [ranking, recap])
  const standingIds = new Set(standing.map((f) => f.id))
  const byId = new Map(
    yesFilmsOf(deck, films, votes, standingIds, undone).map((f) => [f.id, f]),
  )
  const ids = startingOrder([...byId.keys()], dragged ?? deck.ranking ?? [])
  const yesFilms = ids.flatMap((id) => byId.get(id) ?? [])
  const leave = () => {
    left.current = true
    setRanking(false)
  }
  return {
    /** She is on her Ordem: asked, with two or more yesFilms. */
    on: ranking && yesFilms.length >= 2,
    undone,
    films: yesFilms,
    /** Leads to her Ordem, with two or more yesFilms. */
    start: yesFilms.length >= 2 ? () => setRanking(true) : null,
    leave,
    move: (from: number, to: number) => {
      setDragged(moved(ids, from, to))
      say(VOTES.rankMoved(yesFilms[from]?.title ?? '', to + 1, yesFilms.length))
    },
    /** A não from the Ordem: the others keep their places, and a standing
     * sim goes as não. With one sim left, back to the recap. */
    drop: (id: string) => {
      const i = films.findIndex((f) => f.id === id)
      if (i >= 0) drop(i)
      setDragged(ids.filter((other) => other !== id))
      if (standingIds.has(id)) setUndone((u) => new Set([...u, id]))
      if (yesFilms.length <= 2) leave()
    },
    reset: () => {
      setUndone(new Set())
      setDragged(null)
    },
  }
}
