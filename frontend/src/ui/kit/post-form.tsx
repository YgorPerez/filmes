// A form that posts by `fetch` once the JavaScript is in (#235), for the
// screens whose forms only need to know whether their post is running: a
// plain `<form method="post">` before it (`useFetchForm`).

import { createContext, useContext, type ReactNode } from 'react'
import { useFetchForm, type Answered } from './fetch-form'
import { PostFailed } from './status'

type OnAnswer = (to: string, form: HTMLFormElement) => Answered

const PostAnswer = createContext<OnAnswer | undefined>(undefined)

/** What the screen does with the answer of each `PostForm` in `children`,
 * as `useFetchForm`'s `onAnswer` (`usePostedFeedback`); without it, the
 * page goes to the answer. */
export function PostAnswers({
  onAnswer,
  children,
}: {
  onAnswer: OnAnswer
  children: ReactNode
}) {
  return <PostAnswer.Provider value={onAnswer}>{children}</PostAnswer.Provider>
}

/** A `<form method="post">` to `action` (multipart when it sends a file)
 * that posts by `fetch` once the JavaScript is in. `children` see whether
 * its post is running, to disable its buttons and say what it does; a
 * post that got no answer says so over them. */
export function PostForm({
  action,
  label,
  className,
  upload = false,
  children,
}: {
  action: string
  label?: string
  className?: string
  upload?: boolean
  children: (busy: boolean) => ReactNode
}) {
  const { onSubmit, busy, failed } = useFetchForm(useContext(PostAnswer))
  return (
    <form
      method="post"
      action={action}
      encType={upload ? 'multipart/form-data' : undefined}
      aria-label={label}
      onSubmit={onSubmit}
      className={className}
    >
      <PostFailed failed={failed} />
      {children(busy !== null)}
    </form>
  )
}
