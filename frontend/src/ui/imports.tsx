import type { ReactNode } from 'react'
import type { ImportsOverview } from '#/platform/imports'
import { IMPORTS } from './imports.copy'
import { Marquee } from './marquee'
import { Alert, OwnerTag } from './person-parts'
import { buttonVariants } from './shadcn/button'

/** The frame of the Imports screens: the letreiro and the way back. */
export function ImportsFrame({
  back,
  backTo,
  children,
}: {
  back: string
  backTo: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <a href={backTo} className={buttonVariants({ variant: 'quiet' })}>
          {back}
        </a>
      </header>
      {children}
    </main>
  )
}

/** A row of a list that leads to another page. */
function LinkRow({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li className="border-rule not-first:border-t">
      <a
        href={href}
        className="flex min-h-touch flex-wrap items-center gap-x-sm gap-y-xs px-md py-sm text-ink no-underline"
      >
        {children}
        <span aria-hidden="true" className="ml-auto text-ink-2">
          ›
        </span>
      </a>
    </li>
  )
}

const listClass =
  'flex flex-col overflow-hidden rounded-card border border-rule bg-surface'

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
      <div className="flex flex-col gap-sm">
        <h1 className="text-title">{IMPORTS.title}</h1>
        <p className="text-ink-2">{IMPORTS.lead}</p>
      </div>
      {gone && <Alert>{IMPORTS.gone}</Alert>}
      {!overview ? (
        <Alert>{IMPORTS.unavailable}</Alert>
      ) : (
        <>
          <ul className={listClass}>
            <LinkRow href="/fila">
              <span className="font-semibold">{IMPORTS.queue}</span>
              <span className="text-meta text-ink-2">
                {IMPORTS.queued(overview.queued)}
              </span>
            </LinkRow>
          </ul>
          <section aria-labelledby="pessoas" className="flex flex-col gap-sm">
            <h2 id="pessoas" className="text-label text-ink-2 uppercase">
              {IMPORTS.people}
            </h2>
            {overview.people.length === 0 ? (
              <p className="text-ink-2">{IMPORTS.empty}</p>
            ) : (
              <ul className={listClass}>
                {overview.people.map(({ person, name, owner, imports }) => (
                  <LinkRow
                    key={person}
                    href={`/importar/${encodeURIComponent(person)}`}
                  >
                    <span className="font-semibold">{name}</span>
                    {owner && <OwnerTag />}
                    <span className="text-meta text-ink-2">
                      {IMPORTS.count(imports)}
                    </span>
                  </LinkRow>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </ImportsFrame>
  )
}
