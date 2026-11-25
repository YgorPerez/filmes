import type { ReactNode } from 'react'

// What a Dono screen says about the last thing it did: the alert (ink and
// the alert sign, no sticker colour) for a refusal or a failure, and the
// notice for what went through.

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex gap-sm rounded-field border-[1.5px] border-ink px-lg py-2.5 text-ink"
    >
      <span aria-hidden="true">⚠</span>
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
