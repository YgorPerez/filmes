// A form that posts without reloading once the JavaScript is in (#235).
// The form stays a plain POST: before the JavaScript, or when `fetch`
// fails or the route answers anything but `{ to }`, the browser sends it
// as always. With it, the submit goes by
// `fetch` with the same fields and the button pressed, to the same route,
// which answers `{ to }` (`answerFetch`) instead of the 303; the page then
// goes to `to` through the router, keeping the scroll, and reloads its
// data when `to` is the page it was on.

import { useHydrated, useRouter } from '@tanstack/react-router'
import { useRef, useState, type FormEvent } from 'react'
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
    if (!router) return window.location.assign(to)
    // Back to the page it was on: what the post changed is in the page's
    // data, which the router keeps for the same page unless told.
    const same =
      new URL(to, window.location.origin).pathname ===
      router.state.location.pathname
    await router.navigate({ href: to, resetScroll: false })
    if (same) await router.invalidate()
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

/** `onSubmit` for a `<form method="get">` to a page of the app (the
 * Catálogo search): with the router, the page goes to the form's URL
 * without reloading, keeping the scroll; before it, the browser does. */
export function useGetForm() {
  const router = useRouter({ warn: false })
  return (event: FormEvent<HTMLFormElement>) => {
    if (!router) return
    event.preventDefault()
    const form = event.currentTarget
    const query = new URLSearchParams()
    for (const [name, value] of new FormData(form))
      if (typeof value === 'string') query.append(name, value)
    void router.navigate({
      href: `${new URL(form.action).pathname}?${query}`,
      resetScroll: false,
    })
  }
}
