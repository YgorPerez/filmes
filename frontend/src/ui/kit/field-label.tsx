import type { ReactNode } from 'react'

/** A field's label (DESIGN.md, Campos): Rubik 700 14px, with the hint in
 * the system's 14px `ink-2` beside it, over the field. */
export function FieldLabel({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
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
    </label>
  )
}
