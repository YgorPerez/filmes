import { cva } from 'class-variance-authority'

// The DESIGN.md buttons, as classes: `shadcn/button.tsx`'s Button
// (Base UI underneath) takes them, and so do links and the Cartaz, which
// stands alone in the MCP Apps view. `primary` is the screen's main
// action: the orange price sticker's colour, Rubik 800 15px in capitals in
// `on-sticker`, a 44px pill (The One Orange Button Rule: one per screen,
// or per mode of the Claude view). `big` is the home's "Pedir filme": the
// same orange, the whole width, 60px tall, 14px radius, 18px. `option` is
// every other action: a pill with a 1.5px `rule` outline on `surface`,
// Rubik 500 14px; pressed (`aria-pressed`), a 2px `ink` outline on
// `surface-2` in 700. `link` is "Pular", "Retomar" and the smaller
// actions: no background, the system's 14px `ink-2`, underlined.
export const buttonVariants = cva(
  'inline-flex min-h-touch cursor-pointer items-center justify-center gap-sm no-underline select-none disabled:cursor-default disabled:opacity-60',
  {
    variants: {
      variant: {
        primary:
          'rounded-pill bg-sticker-orange px-3xl font-display text-button text-on-sticker uppercase',
        big: 'min-h-[60px] w-full rounded-panel bg-sticker-orange px-3xl font-display text-button-big text-on-sticker uppercase',
        option:
          'rounded-pill border-(length:--border-width-stroke) border-rule bg-surface px-xl font-display text-control text-ink aria-pressed:border-2 aria-pressed:border-ink aria-pressed:bg-surface-2 aria-pressed:font-bold',
        link: 'justify-start px-0 font-body text-link text-ink-2 underline underline-offset-3',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)
