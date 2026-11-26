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

const SHAPES = {
  pill: 'rounded-pill px-xl',
  row: 'w-full rounded-nav-row px-lg py-sm',
} as const

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
  // The input covers the whole option, transparent: a tap anywhere on it
  // is a tap on the control itself.
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
    className: 'absolute inset-0 m-0 size-full cursor-pointer opacity-0',
  }
  return (
    <label
      className={`group relative inline-flex min-h-touch cursor-pointer items-center gap-sm border-(length:--border-width-stroke) border-rule bg-surface font-display text-control text-ink select-none has-checked:border-2 has-checked:border-ink has-checked:bg-surface-2 has-checked:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${SHAPES[shape]}`}
    >
      {type === 'radio' ? (
        <input type="radio" {...input} />
      ) : (
        <input type="checkbox" {...input} />
      )}
      <Icon name="check" className="hidden size-4 group-has-checked:block" />
      <span className="min-w-0">{children}</span>
    </label>
  )
}
