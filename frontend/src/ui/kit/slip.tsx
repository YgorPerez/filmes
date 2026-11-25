import type { ReactNode } from 'react'

// The rental slip (DESIGN.md, Ficha da última Sessão): `surface` with a 1px
// `rule`, 12px radius, and a header torn off the rest by a dashed rule (the
// stub), with the title in Rubik 800 13px capitals `ink-2` and, at the
// right, a short aside. The screens that sum something up use it.

export function Slip({
  id,
  title,
  aside,
  children,
}: {
  id: string
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-lg rounded-card border border-rule bg-surface px-xl pt-2xl pb-xl"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-sm gap-y-2xs border-b border-dashed border-rule pb-md">
        <h2
          id={id}
          className="font-display text-[13px] leading-none font-extrabold tracking-[0.08em] text-ink-2 uppercase"
        >
          {title}
        </h2>
        {aside && <span className="text-meta text-ink-2">{aside}</span>}
      </header>
      {children}
    </section>
  )
}
