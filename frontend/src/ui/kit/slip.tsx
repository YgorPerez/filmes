import type { ReactNode } from 'react'

// The rental slip (DESIGN.md, Ficha da última Sessão): `surface` with a 1px
// `rule`, 12px radius, and a header torn off the rest by a dashed rule (the
// stub). The stub holds the title in Rubik 800 13px capitals `ink-2` with a
// short aside at the right, or, on a Session's card, its own `head`. A
// `lead` under the stub says what the slip holds. The screens that sum
// something up use it.

type Stub =
  | { id: string; title: string; aside?: ReactNode; head?: never }
  | { head: ReactNode; id?: never; title?: never; aside?: never }

export function Slip({
  lead,
  as: Tag = 'section',
  children,
  ...stub
}: Stub & {
  lead?: string
  /** `article` when the slip stands for one thing of a list (a Session). */
  as?: 'section' | 'article'
  children: ReactNode
}) {
  return (
    <Tag
      aria-labelledby={stub.id}
      className="flex min-w-0 scroll-mt-2xl flex-col gap-lg rounded-card border border-rule bg-surface px-xl pt-2xl pb-xl"
    >
      {stub.head === undefined ? (
        <header className="flex flex-wrap items-baseline justify-between gap-x-sm gap-y-2xs border-b border-dashed border-rule pb-md">
          <h2
            id={stub.id}
            className="font-display text-[13px] leading-none font-extrabold tracking-[0.08em] text-ink-2 uppercase"
          >
            {stub.title}
          </h2>
          {stub.aside !== undefined && (
            <span className="text-meta text-ink-2 tabular-nums">
              {stub.aside}
            </span>
          )}
        </header>
      ) : (
        <div className="border-b border-dashed border-rule pb-md">
          {stub.head}
        </div>
      )}
      {lead && <p className="text-meta text-ink-2">{lead}</p>}
      {children}
    </Tag>
  )
}
