// A refusal a form posted by `fetch` came back with (#235), shown in place
// over the form as the Dono left it, and scrolled into view. The page's
// own (`?erro=` of a plain POST) is where it starts.

import { useEffect, useRef, useState } from 'react'

/** Reads the refusal of an answer's `to`: its `?erro=` when `isRefusal`
 * says it is one (and `to` is `path`, when given), null otherwise. */
export const refusalOn =
  <R extends string>(
    isRefusal: (value: unknown) => value is R,
    path?: string,
  ) =>
  (to: URL): R | null => {
    const why = to.searchParams.get('erro')
    return (path === undefined || to.pathname === path) && isRefusal(why)
      ? why
      : null
  }

/** `refused`: the refusal to show, from the page's URL first, then from
 * the last answer. `onAnswer` is `useFetchForm`'s: true when `to` is a
 * refusal (`readRefusal` gives it, `refusalOn` makes one), which then
 * shows here and in no new page; anything else clears it. `alert` goes on
 * the alert's box; `refusals`, how many came back by `fetch`. */
export function useRefusalInPlace<R extends string>(
  initial: R | undefined,
  readRefusal: (to: URL) => R | null,
) {
  const [refused, setRefused] = useState(initial)
  const [refusals, setRefusals] = useState(0)
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (refusals > 0) alert.current?.scrollIntoView({ block: 'center' })
  }, [refusals])
  const onAnswer = (to: string) => {
    const why = readRefusal(new URL(to, window.location.origin))
    setRefused(why ?? undefined)
    if (why === null) return false
    setRefusals((n) => n + 1)
    return true
  }
  return { refused, refusals, alert, onAnswer }
}
