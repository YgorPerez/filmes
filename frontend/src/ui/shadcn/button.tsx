import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

// The DESIGN.md buttons, on shadcn's `base-nova` Button (Base UI underneath),
// with its colors swapped for the tokens. `primary` is the screen's main
// action: marquee red, white 700 15px, a 44px pill (The Rare Red Rule: one
// per screen). `quiet` is every other action: surface, 1px rule, ink.
export const buttonVariants = cva(
  'inline-flex min-h-touch cursor-pointer items-center justify-center gap-sm rounded-pill px-[22px] text-button no-underline select-none disabled:cursor-default disabled:opacity-60',
  {
    variants: {
      variant: {
        primary: 'bg-marquee-red text-on-red',
        quiet: 'border border-rule bg-surface text-ink',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

export function Button({
  className,
  variant,
  type = 'button',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      className={buttonVariants({
        variant,
        className: String(className ?? ''),
      })}
      {...props}
    />
  )
}
