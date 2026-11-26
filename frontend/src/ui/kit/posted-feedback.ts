// What a screen says about a form it posted by `fetch` (#240): the page
// stays where the Dono was, so the notice or the alert the answer brought
// scrolls into view, and a form that went through is emptied, as the
// reload emptied it (a file picked, a name typed). A refusal keeps the
// form as the Dono left it.

import { useEffect, useRef } from 'react'

/** `feedback`, the box of the notice or alert, and `onAnswer`, for
 * `useFetchForm`: it lets the page go to the answer. `shown` names what
 * the box says; when it changes after a post, the box scrolls into view. */
export function usePostedFeedback(shown: string) {
  const feedback = useRef<HTMLDivElement>(null)
  const posted = useRef(false)
  const last = useRef(shown)
  useEffect(() => {
    if (last.current === shown) return
    last.current = shown
    if (!posted.current) return
    posted.current = false
    feedback.current?.scrollIntoView({ block: 'nearest' })
  }, [shown])
  const onAnswer = (to: string, form: HTMLFormElement) => {
    posted.current = true
    if (!new URL(to, window.location.origin).searchParams.has('erro'))
      form.reset()
    return false
  }
  return { feedback, onAnswer }
}
