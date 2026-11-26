import type { ReactNode } from 'react'
import { Alert, Section, Submit } from './person-parts'

// The form every Operações action posts: `/operacoes/acao`, with the
// action in `acao`. The Operações screens take the alert, the section and
// the submit button of the Dono screens from here, with the rest of their
// parts, which keeps person-parts under fallow's coupling threshold (its
// fan-in at most the project's p95), as person-parts does for kit/status.

export { Alert, Section, Submit }

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
