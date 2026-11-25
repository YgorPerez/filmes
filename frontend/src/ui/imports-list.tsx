import type { ReactNode } from 'react'
import type { ImportsOverview } from '#/platform/imports'
import { ImportsFrame } from './imports'
import { IMPORTS } from './imports.copy'
import { PageHead } from './kit/page-head'
import { RowArrow } from './kit/row-arrow'
import { OwnerTag } from './kit/owner-tag'
import { Alert } from './kit/status'

// `/importar` as a shelf: the resolution queue first, on the blue card
// stock while films wait for the Dono (like "Falta contar como foi"), then
// one tape spine per Pessoa, each leading to her imports.

const ROW =
  'flex min-h-[52px] items-center gap-lg rounded-nav-row border no-underline'

/** The resolution queue's row: card stock while something waits. */
function QueueRow({ queued }: { queued: number }) {
  const waiting = queued > 0
  return (
    <a
      href="/fila"
      className={`${ROW} px-xl ${waiting ? 'border-transparent bg-card-stock text-card-stock-ink' : 'border-rule bg-surface text-ink'}`}
    >
      <span className="font-display text-[15px] font-bold">
        {IMPORTS.queue}
      </span>
      <span
        className={`ml-auto text-meta tabular-nums ${waiting ? 'font-semibold' : 'text-ink-2'}`}
      >
        {IMPORTS.queued(queued)}
      </span>
      <RowArrow />
    </a>
  )
}

/** A Pessoa on the shelf: the tape's black spine, her name, the Dono tag
 * and how many imports she has. */
function PersonRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <a
        href={href}
        className={`${ROW} overflow-hidden border-rule bg-surface pr-xl text-ink`}
      >
        <span aria-hidden="true" className="w-2 self-stretch bg-case" />
        {children}
        <RowArrow />
      </a>
    </li>
  )
}

function People({ people }: { people: ImportsOverview['people'] }) {
  return (
    <section aria-labelledby="pessoas" className="flex flex-col gap-sm">
      <h2 id="pessoas" className="font-display text-label text-ink-2 uppercase">
        {IMPORTS.people}
      </h2>
      {people.length === 0 ? (
        <p className="text-ink-2">{IMPORTS.empty}</p>
      ) : (
        <ul className="flex flex-col gap-xs">
          {people.map(({ person, name, owner, imports }) => (
            <PersonRow
              key={person}
              href={`/importar/${encodeURIComponent(person)}`}
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-sm gap-y-2xs py-sm">
                <span className="font-display text-[15px] font-bold">
                  {name}
                </span>
                {owner && <OwnerTag />}
              </span>
              <span className="ml-auto shrink-0 text-meta text-ink-2 tabular-nums">
                {IMPORTS.count(imports)}
              </span>
            </PersonRow>
          ))}
        </ul>
      )}
    </section>
  )
}

/** `/importar`: each Pessoa, with how many imports she has, and the
 * resolution queue. `overview` is null when the engine cannot run here. */
export function ImportsList({
  overview,
  gone = false,
}: {
  overview: ImportsOverview | null
  gone?: boolean
}) {
  return (
    <ImportsFrame back={IMPORTS.back} backTo="/">
      <PageHead title={IMPORTS.title} lead={IMPORTS.lead} />
      {gone && <Alert>{IMPORTS.gone}</Alert>}
      {!overview ? (
        <Alert>{IMPORTS.unavailable}</Alert>
      ) : (
        <>
          <QueueRow queued={overview.queued} />
          <People people={overview.people} />
        </>
      )}
    </ImportsFrame>
  )
}
