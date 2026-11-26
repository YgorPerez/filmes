// What a screen says about a form it posted by `fetch` (#240): the page
// stays where the Dono was, so the notice or the alert the answer brought
// scrolls into view once the page has it, even when it says what it said
// before, and a form that went through is emptied, as the reload emptied
// it (a file picked, a name typed). A refusal keeps the form as the Dono
// left it.

import { useEffect, useRef, useState } from 'react'
import type { Answered } from './fetch-form'

/** `feedback`, the box of the notice or alert, and `onAnswer`, for
 * `useFetchForm`: it lets the page go to the answer, and scrolls the box
 * into view once the page loaded it. */
export function usePostedFeedback() {
  const feedback = useRef<HTMLDivElement>(null)
  const [answers, setAnswers] = useState(0)
  useEffect(() => {
    if (answers > 0) feedback.current?.scrollIntoView({ block: 'nearest' })
  }, [answers])
  const onAnswer = (to: string, form: HTMLFormElement): Answered => {
    if (!new URL(to, window.location.origin).searchParams.has('erro'))
      form.reset()
    return () => setAnswers((n) => n + 1)
  }
  return { feedback, onAnswer }
}
