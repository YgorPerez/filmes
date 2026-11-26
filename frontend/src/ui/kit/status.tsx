import type { ReactNode } from 'react'
import { Icon } from './icon'

// What a Dono screen says about the last thing it did: the alert (ink and
// the alert icon, no sticker colour) for a refusal or a failure, and the
// notice for what went through. The alert is a box with a 1.5px `ink`
// outline; `strip` drops the box for the shell's strip under the top bar,
// and `className` adds the place's own (the surface on a card, the width).

export function Alert({
  strip = false,
  className = '',
  children,
}: {
  strip?: boolean
  className?: string
  children: ReactNode
}) {
  const box = strip
    ? ''
    : 'rounded-field border-(length:--border-width-stroke) border-ink px-lg py-md'
  return (
    <p
      role="alert"
      className={`flex items-start gap-sm text-ink ${box} ${className}`}
    >
      <Icon name="alert" className="mt-px size-[18px]" />
      <span>{children}</span>
    </p>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-field border border-rule bg-surface-2 px-3 py-2.5"
    >
      {children}
    </p>
  )
}

/** What a form posted by `fetch` says when its post got no answer to go
 * by (`useFetchForm`'s `failed`): the server may have done it, so the Dono
 * looks before sending it again. */
export const POST_FAILED =
  'Não deu para confirmar o envio. Confira a conexão e, se nada mudou, tente de novo.'

export function PostFailed({ failed }: { failed: boolean }) {
  return failed ? <Alert>{POST_FAILED}</Alert> : null
}
