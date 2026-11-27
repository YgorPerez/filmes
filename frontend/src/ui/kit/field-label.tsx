import type { ReactNode } from 'react'
import { Icon } from './icon'

/** A field's label (DESIGN.md, Campos): Rubik 700 14px, with the hint in
 * the system's 14px `ink-2` beside it, over the field. With `error`, what
 * is wrong with the field, under it: ink with the alert icon (an error
 * takes no sticker colour); the field names it in `aria-describedby`. */
export function FieldLabel({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: { id: string; text: string }
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="font-display text-field-label">
        {label}
        {hint && (
          <>
            {' '}
            <span className="font-body font-normal text-ink-2">{hint}</span>
          </>
        )}
      </span>
      {children}
      {error && (
        <span
          id={error.id}
          className="flex items-start gap-2xs text-meta text-ink"
        >
          <Icon name="alert" className="mt-px size-4 shrink-0" />
          {error.text}
        </span>
      )}
    </label>
  )
}
