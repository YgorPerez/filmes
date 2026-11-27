import type { ChangeEvent, ReactNode } from 'react'
import { Icon } from './icon'

// An option to mark (DESIGN.md, Opções): a 44px pill with a 1.5px `rule`
// outline on `surface`, Rubik 500 14px; marked, a 2px `ink` outline on
// `surface-2` in 700, with the 16px ✓ before the text. Here the option is a
// native checkbox or radio inside its label, so a plain form posts it, the
// keyboard and the screen reader get the real control, and the pill only
// draws its state (`has-checked`) and the focus ring of the input in it.
// `shape="row"` is the same option for a text too long for a pill (a
// Regra, a film): a 10px corner, and the text wraps. With `checked`, the
// page holds the state (the Cartaz's Clima chips) and `onChange` gets each
// tap.
//
// Marking never moves the row (#268): the marked pill has the same width as
// the unmarked one. Unmarked, 22px each side inside the 1.5px outline;
// marked, 9.5px each side inside the 2px one, around the ✓ (16px) and its
// 8px gap, which is the same 47px; and the text keeps
// the room of its bold weight in both (`MarkText`). The ✓ answers only to the
// option's own input (`group/option`), not to a checked control elsewhere in
// a `<details>` or a fieldset around it.

/** The padding of a markable pill: the room of the ✓ while unmarked. With
 * `aria-pressed` (a button) instead of a checked input, see `PRESSED_PILL`. */
const MARK_PILL = 'rounded-pill px-3xl has-checked:px-[9.5px]'

/** `MARK_PILL` for a button that says its state in `aria-pressed`. */
export const PRESSED_PILL = 'px-3xl aria-pressed:px-[9.5px]'

const SHAPES = {
  pill: MARK_PILL,
  row: 'w-full rounded-nav-row px-lg py-sm leading-snug',
} as const

/** The option's text with the width of its bold, marked weight kept in
 * both states: a hidden bold copy of a plain text, in `::after`, holds the
 * room without a second node for the screen reader or a query. */
export function MarkText({ children }: { children: ReactNode }) {
  if (typeof children !== 'string')
    return <span className="min-w-0">{children}</span>
  return (
    <span
      data-text={children}
      className="grid min-w-0 after:invisible after:h-0 after:font-bold after:content-[attr(data-text)]"
    >
      {children}
    </span>
  )
}

export function Option({
  type = 'checkbox',
  name,
  value = 'sim',
  defaultChecked,
  checked,
  onChange,
  shape = 'pill',
  children,
}: {
  type?: 'checkbox' | 'radio'
  name: string
  value?: string
  defaultChecked?: boolean
  checked?: boolean
  onChange?: (checked: boolean) => void
  shape?: keyof typeof SHAPES
  children: ReactNode
}) {
  // The input covers the whole option, outline included, transparent: a
  // tap anywhere on it is a tap on the control itself, and the control
  // itself is the 44px of the pill (#277).
  const input = {
    name,
    value,
    ...(checked === undefined
      ? { defaultChecked }
      : {
          checked,
          onChange: (e: ChangeEvent<HTMLInputElement>) =>
            onChange?.(e.target.checked),
        }),
    className:
      'absolute -inset-0.5 m-0 size-[calc(100%+4px)] cursor-pointer opacity-0',
  }
  return (
    <label
      className={`group/option relative inline-flex min-h-touch cursor-pointer items-center gap-sm border-(length:--border-width-stroke) border-rule bg-surface font-display text-control text-ink select-none has-checked:border-2 has-checked:border-ink has-checked:bg-surface-2 has-checked:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${SHAPES[shape]}`}
    >
      {type === 'radio' ? (
        <input type="radio" {...input} />
      ) : (
        <input type="checkbox" {...input} />
      )}
      <Icon
        name="check"
        className="hidden size-4 shrink-0 group-has-checked/option:block"
      />
      {shape === 'pill' ? (
        <MarkText>{children}</MarkText>
      ) : (
        <span className="min-w-0">{children}</span>
      )}
    </label>
  )
}
