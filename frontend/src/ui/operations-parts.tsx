import type { ReactNode } from 'react'
import { useFetchForm } from './kit/fetch-form'
import { OPERATIONS } from './operations.copy'
import { Button } from './shadcn/button'

export function ActionPost({
  action,
  className,
  submitClassName,
  children,
}: {
  action: 'avaliar' | 'enviar'
  className?: string
  submitClassName?: string
  children?: ReactNode
}) {
  const { onSubmit, busy } = useFetchForm()
  const sending = busy !== null
  const { evaluation, push } = OPERATIONS
  const label = action === 'avaliar' ? evaluation.run : push.retry
  const pending = action === 'avaliar' ? evaluation.running : push.sending
  return (
    <form
      method="post"
      action="/operacoes/acao"
      className={className}
      onSubmit={onSubmit}
    >
      <input type="hidden" name="acao" value={action} />
      {children}
      <Button
        type="submit"
        variant="option"
        className={submitClassName ?? 'self-start'}
        disabled={sending}
      >
        {sending ? pending : label}
      </Button>
    </form>
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
