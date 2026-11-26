// A form that posts without reloading once the JavaScript is in (#235).
// The form stays a plain POST: before the JavaScript, the browser sends it
// as always. With it, the submit goes by `fetch` with the same fields and
// the button pressed, to the same route, whose 303 the server turns into
// `{ to }` (`answerFetch`, in `server.ts`); the page then goes to `to`
// through the router, keeping the scroll, and loads again what it shows
// when `to` is the page it was on. A post is never sent twice: the server
// may have done it even when its answer did not come back.

import { useHydrated, useRouter } from '@tanstack/react-router'
import { useRef, useState, type FormEvent } from 'react'
import { FETCH_HEADER } from '#/content/fetch-answer'

export { useHydrated }

/** What `onAnswer` says of an answer: true when it took care of it (a
 * refusal shown in place), false to let the page go there, or what to do
 * once the page got there and loaded. */
export type Answered = boolean | (() => void)

/** The answer's `to`; null for one that is not `{ to }` (a 403, a 500). */
async function answerOf(response: Response): Promise<string | null> {
  if (!response.ok) return null
  const body: unknown = await response.json().catch(() => null)
  const to = (body as { to?: unknown } | null)?.to
  return typeof to === 'string' ? to : null
}

/** `onSubmit` for a `<form method="post">`; `busy`, the `name` of the
 * button whose post is running (`''` for one without a name), null when
 * none is; and `failed`, true when the last post got no answer to go by:
 * the page then says so (`PostFailed`) instead of sending it again. A
 * second submit while one runs is dropped. `onAnswer` sees the `to` (and
 * the form posted) first (`Answered`). */
export function useFetchForm(
  onAnswer?: (to: string, form: HTMLFormElement) => Answered,
) {
  const router = useRouter({ warn: false })
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const running = useRef(false)

  const go = async (to: string, form: HTMLFormElement) => {
    const answered = onAnswer?.(to, form) ?? false
    if (answered === true) return
    if (!router) return window.location.assign(to)
    const stays =
      new URL(to, window.location.origin).pathname ===
      router.state.location.pathname
    await router.navigate({ href: to, resetScroll: false })
    // The post changed what the page shows, and a route that stays (only
    // its query changes) keeps its loader's data: load it again, the post
    // still running until it is in.
    if (stays) await router.invalidate({ sync: true })
    const loaded = router.state.matches.every(
      (match) => match.status !== 'error',
    )
    if (loaded && typeof answered === 'function') answered()
  }

  const answer = async (response: Response, form: HTMLFormElement) => {
    const to = await answerOf(response)
    if (to !== null) return go(to, form)
    // The server went somewhere else (the login, when the session ended):
    // the page goes there too.
    if (response.redirected) return window.location.assign(response.url)
    setFailed(true)
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (running.current) return
    const form = event.currentTarget
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    running.current = true
    setBusy(submitter?.getAttribute('name') ?? '')
    setFailed(false)
    void fetch(form.action, {
      method: 'POST',
      body: new FormData(form, submitter),
      headers: { [FETCH_HEADER]: '1' },
    })
      .then(
        (response) => answer(response, form),
        () => setFailed(true),
      )
      .finally(() => {
        running.current = false
        setBusy(null)
      })
  }

  return { onSubmit, busy, failed }
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
