import type { ReactNode } from 'react'
import { mergeClasses } from './class-merge'
import { Icon } from './icon'

// A fold with no box of its own (#274): a row of the touch height, its
// label and the drawn +, a × while open, with a dashed rule above it, as
// the import page's "Como baixar" rows and the queue's cards. For more of
// what a slip already shows, or a way that is not the recommended one,
// inside a slip, where a bordered fold would be a card inside a card. The
// → stays for links that leave the page.

export function FoldRow({
  summary,
  open,
  rule = true,
  className,
  children,
}: {
  summary: string
  /** Open from the start: what it holds came back refused. */
  open?: boolean
  /** The dashed rule above: off for the first row of a list. */
  rule?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <details
      open={open}
      className={mergeClasses(
        rule ? 'border-t border-dashed border-rule' : undefined,
        className,
      )}
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-md font-display text-row-title select-none [&::-webkit-details-marker]:hidden">
        {summary}
        {/* Only its own fold turns it: a group variant would match an open
            fold around this one too. */}
        <Icon
          name="plus"
          className="size-[18px] shrink-0 text-ink-2 transition-[rotate] motion-reduce:transition-none [details[open]>summary>&]:rotate-45"
        />
      </summary>
      <div className="flex flex-col gap-lg pt-xs pb-md">{children}</div>
    </details>
  )
}
