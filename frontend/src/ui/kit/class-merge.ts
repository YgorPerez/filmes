import { extendTailwindMerge } from 'tailwind-merge'

// Class lists merged the Tailwind way: of two classes that set the same
// thing, the later one stays. A kit piece puts the caller's `className` last,
// so `buttonVariants({ className: 'min-h-[64px]' })` replaces the variant's
// `min-h-touch` instead of losing to it in the CSS order (#268).
//
// tailwind-merge only knows Tailwind's own scales; these are the DESIGN.md
// tokens of `ui/tokens.css`, so it can tell `text-control` (a size) from
// `text-ink` (a colour). `class-merge.test.ts` checks the lists against the
// file.

export const TOKENS = {
  color: [
    'ground',
    'surface',
    'surface-2',
    'ink',
    'ink-2',
    'rule',
    'rule-strong',
    'case',
    'case-edge',
    'case-ink',
    'case-ink-2',
    'shelf-label',
    'on-sticker',
    'sticker-orange',
    'sticker-yellow',
    'sticker-pink',
    'sticker-green',
    'stamp',
    'card-stock',
    'card-stock-ink',
    'star',
    'focus',
    'on-person',
    'person-1',
    'person-2',
    'person-3',
    'person-4',
    'person-5',
    'person-6',
    'genre-blue',
    'genre-violet',
    'genre-yellow',
    'genre-green',
    'genre-orange',
    'genre-pink',
  ],
  text: [
    'shelf',
    'shelf-compact',
    'price',
    'price-compact',
    'sticker',
    'title',
    'row-title',
    'page-title',
    'counter-title',
    'step-title',
    'step-title-small',
    'brand',
    'button',
    'button-big',
    'control',
    'field-label',
    'label',
    'slip-title',
    'meta-strong',
    'chip',
    'tab',
    'avatar',
    'rating-disc',
    'cover-mark',
    'hand',
    'hand-compact',
    'hand-small',
    'hand-large',
    'body',
    'synopsis',
    'evidence',
    'evidence-step',
    'link',
    'meta',
    'source',
    'url',
  ],
  radius: [
    'plate',
    'cover',
    'note',
    'tape-small',
    'rail',
    'case',
    'field',
    'nav-row',
    'card',
    'panel',
    'pill',
    'round',
  ],
  spacing: [
    '2xs',
    'xs',
    'sm',
    'md',
    'lg',
    'xl',
    '2xl',
    '3xl',
    'touch',
    'tab-safe',
    'tab-clearance',
  ],
} as const

const merge = extendTailwindMerge({
  extend: {
    theme: {
      color: [...TOKENS.color],
      text: [...TOKENS.text],
      radius: [...TOKENS.radius],
      spacing: [...TOKENS.spacing],
    },
  },
})

/** The classes, the later of two conflicting ones winning. */
export const mergeClasses = (...classes: readonly (string | undefined)[]) =>
  merge(...classes)

/** A `cva` that merges the caller's `className` last, so it replaces the
 * variant's classes it conflicts with. */
export const withMergedClasses =
  <P extends object>(variants: (props?: P) => string) =>
  ({ className, ...props }: P & { className?: string } = {} as P) =>
    mergeClasses(variants(props as P), className)
