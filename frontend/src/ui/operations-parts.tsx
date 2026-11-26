import type { ReactNode } from 'react'

// The form every Operações action posts: `/operacoes/acao`, with the
// action in `acao`.

/** A plain POST of one action (`acao`): it works before the JavaScript. */
export function ActionPost({
  action,
  className,
  children,
}: {
  action: 'avaliar' | 'enviar'
  className?: string
  children: ReactNode
}) {
  return (
    <form method="post" action="/operacoes/acao" className={className}>
      <input type="hidden" name="acao" value={action} />
      {children}
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
