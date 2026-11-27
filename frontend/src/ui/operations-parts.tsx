import type { ReactNode } from 'react'
import { PostForm } from './kit/post-form'
import { OPERATIONS } from './operations.copy'
import { Alert, Disclosure, Section, Submit } from './person-parts'

// The form every Operações action posts: `/operacoes/acao`, with the
// action in `acao`. The Operações screens take the alert, the fold, the
// section and the submit button of the Dono screens from here, with the rest of their
// parts, which keeps person-parts under fallow's coupling threshold (its
// fan-in at most the project's p95), as person-parts does for kit/status.

export { Alert, Disclosure, Section, Submit }

export function ActionPost({
  action,
  className,
  submitClassName,
  primary = false,
  children,
}: {
  action: 'avaliar' | 'enviar'
  className?: string
  submitClassName?: string
  /** The page's orange button (the push's retry while pushes fail). */
  primary?: boolean
  children?: ReactNode
}) {
  const { evaluation, push } = OPERATIONS
  const label = action === 'avaliar' ? evaluation.run : push.retry
  const pending = action === 'avaliar' ? evaluation.running : push.sending
  return (
    <PostForm action="/operacoes/acao" className={className}>
      {(sending) => (
        <>
          <input type="hidden" name="acao" value={action} />
          {children}
          <Submit
            variant={primary ? 'primary' : 'option'}
            className={submitClassName}
            disabled={sending}
          >
            {sending ? pending : label}
          </Submit>
        </>
      )}
    </PostForm>
  )
}

/** The technical half of a message, under the plain sentence: the code or
 * the setting an admin looks up, smaller and in ink-2. */
export function Detail({ children }: { children: ReactNode }) {
  return (
    <small className="mt-xs block text-meta wrap-anywhere text-ink-2">
      {children}
    </small>
  )
}
