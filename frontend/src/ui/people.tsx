import type { PersonEntry } from '#/platform/people'
import { Marquee } from './marquee'
import { PEOPLE } from './person.copy'
import { Alert, OwnerTag } from './person-parts'
import { buttonVariants } from './shadcn/button'

/** `/pessoas`: every Pessoa of filmes-dados, each a link to her page.
 * `people` is null when the engine cannot run on this server. */
export function PeopleList({
  people,
  gone = false,
}: {
  people: PersonEntry[] | null
  gone?: boolean
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <a href="/" className={buttonVariants({ variant: 'quiet' })}>
          {PEOPLE.back}
        </a>
      </header>
      <div className="flex flex-col gap-sm">
        <h1 className="text-title">{PEOPLE.title}</h1>
        <p className="text-ink-2">{PEOPLE.lead}</p>
      </div>
      {gone && <Alert>{PEOPLE.gone}</Alert>}
      {!people ? (
        <Alert>{PEOPLE.unavailable}</Alert>
      ) : people.length === 0 ? (
        <p className="text-ink-2">{PEOPLE.empty}</p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-card border border-rule bg-surface">
          {people.map(({ person, name, aliases, owner }) => (
            <li key={person} className="border-rule not-first:border-t">
              <a
                href={`/pessoas/${encodeURIComponent(person)}`}
                className="flex min-h-touch flex-wrap items-center gap-x-sm gap-y-xs px-md py-sm text-ink no-underline"
              >
                <span className="font-semibold">{name}</span>
                {owner && <OwnerTag />}
                {aliases.length > 0 && (
                  <span className="text-meta text-ink-2">
                    {PEOPLE.aliases(aliases)}
                  </span>
                )}
                <span aria-hidden="true" className="ml-auto text-ink-2">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
