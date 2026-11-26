// A form that posts by `fetch` once the JavaScript is in (#235), for the
// screens whose forms only need to know whether their post is running: a
// plain `<form method="post">` before it (`useFetchForm`).

import { createContext, useContext, type ReactNode } from 'react'
import { useFetchForm } from './fetch-form'

/** What the screen does with the answer of each `PostForm` in it, as
 * `useFetchForm`'s `onAnswer` (`usePostedFeedback`); none lets the page go
 * to the answer. */
export const PostAnswer = createContext<
  ((to: string, form: HTMLFormElement) => boolean) | undefined
>(undefined)

/** A `<form method="post">` to `action` (multipart when it sends a file)
 * that posts by `fetch` once the JavaScript is in. `children` see whether
 * its post is running, to disable its buttons and say what it does. */
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
  const { onSubmit, busy } = useFetchForm(useContext(PostAnswer))
  return (
    <form
      method="post"
      action={action}
      encType={upload ? 'multipart/form-data' : undefined}
      aria-label={label}
      onSubmit={onSubmit}
      className={className}
    >
      {children(busy !== null)}
    </form>
  )
}
