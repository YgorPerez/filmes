// A form that posts without reloading once the JavaScript is in (#235).
// The form stays a plain POST: before the JavaScript, or when `fetch`
// fails or the route answers anything but `{ to }`, the browser sends it
// as always. With it, the submit goes by
// `fetch` with the same fields and the button pressed, to the same route,
// which answers `{ to }` (`answerFetch`) instead of the 303; the page then
// goes to `to` through the router, keeping the scroll.

import { useHydrated, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FETCH_HEADER } from '#/content/fetch-answer'

export { useHydrated }

/** The answer's `to`, or null for anything else (a 403, a login page). */
async function answerOf(response: Response): Promise<string | null> {
  if (!response.ok) return null
  const body: unknown = await response.json().catch(() => null)
  const to = (body as { to?: unknown } | null)?.to
  return typeof to === 'string' ? to : null
}

/** `onSubmit` for a `<form method="post">`, and `busy`: the `name` of the
 * button whose post is running (`''` for one without a name), null when
 * none is. A second submit while one runs is dropped. `onAnswer` sees the
 * `to` first and returns true when it took care of it (a refusal shown in
 * place); otherwise the page goes there. */
export function useFetchForm(onAnswer?: (to: string) => boolean) {
  const router = useRouter({ warn: false })
  const [busy, setBusy] = useState<string | null>(null)
  const running = useRef(false)

  const go = async (to: string) => {
    if (onAnswer?.(to)) return
    if (router) await router.navigate({ href: to, resetScroll: false })
    else window.location.assign(to)
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (running.current) return
    const form = event.currentTarget
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    running.current = true
    setBusy(submitter?.getAttribute('name') ?? '')
    void fetch(form.action, {
      method: 'POST',
      body: new FormData(form, submitter),
      headers: { [FETCH_HEADER]: '1' },
    })
      .then(answerOf)
      .catch(() => null)
      .then(async (to) => {
        if (to !== null) return go(to)
        // Anything but `{ to }`: the plain POST, which shows it, with
        // the button pressed as a field (`submit()` sends no submitter).
        const pressed = submitter?.getAttribute('name')
        if (pressed) {
          const kept = document.createElement('input')
          kept.type = 'hidden'
          kept.name = pressed
          kept.value = submitter?.getAttribute('value') ?? ''
          form.append(kept)
        }
        form.submit()
      })
      .finally(() => {
        running.current = false
        setBusy(null)
      })
  }

  return { onSubmit, busy }
}

/** A refusal the post by `fetch` came back with: shown in place, over the
 * form as the Dono left it, and scrolled into view (`alert`, on the box of
 * the alert). `onAnswer` (for `useFetchForm`) takes a `to` back to the
 * form's page `path` with an `?erro=` that `isRefusal`; `refusal` is the
 * one the page came with (a plain POST). */
export function useRefusalInPlace<R extends string>(
  path: string,
  isRefusal: (value: unknown) => value is R,
  refusal: R | undefined,
) {
  const [refused, setRefused] = useState(refusal)
  const [refusals, setRefusals] = useState(0)
  const alert = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (refusals > 0) alert.current?.scrollIntoView({ block: 'center' })
  }, [refusals])
  const onAnswer = (to: string) => {
    const url = new URL(to, window.location.origin)
    const why = url.searchParams.get('erro')
    if (url.pathname !== path || !isRefusal(why)) return false
    setRefused(why)
    setRefusals((n) => n + 1)
    return true
  }
  return { refused, alert, onAnswer }
}
