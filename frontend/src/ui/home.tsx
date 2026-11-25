import type { HomeData, SetupView } from '#/platform/setup-guide'
import {
  AskBig,
  AskEarly,
  Guide,
  isGuiding,
  Latest,
  MemberCard,
  MemberStrip,
} from './home-parts'
import { HOME } from './home.copy'
import { RowArrow } from './kit/row-arrow'

// The home in the Locadora de bairro (DESIGN.md, Home: o guia como
// carteirinha de sócio). While a step is pending: the membership card, the
// steps and "pedir filme" as an option. Once none is: the compact card,
// the big "pedir filme", the latest Sessão's stub and the shelf. The shelf
// is there in both, so every screen stays one tap away; the guide never
// blocks asking for a film.

type ShelfItem = {
  href: string
  label: string
  /** The dot's fixed colour: a reminder, not information. */
  dot: string
  count?: string
}

/** Every other screen, a row each: the dot, the name, its count, an arrow. */
function Shelf({ items }: { items: ShelfItem[] }) {
  return (
    <nav aria-label={HOME.shelf.title}>
      <ul className="flex flex-col gap-xs">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="flex min-h-[52px] items-center gap-md rounded-nav-row border border-rule bg-surface px-lg font-display text-[15px] font-bold text-ink no-underline"
            >
              <span
                aria-hidden="true"
                className={`size-3 shrink-0 rounded-round ${item.dot}`}
              />
              {item.label}
              {item.count && (
                <span className="font-body text-meta font-normal text-ink-2 tabular-nums">
                  {item.count}
                </span>
              )}
              <RowArrow className="ml-auto" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

const shelfItems = (home: HomeData, admin: boolean): ShelfItem[] => {
  const { shelf } = HOME
  return [
    {
      href: '/sessoes',
      label: shelf.sessions,
      dot: 'bg-genre-blue',
      count: home.sessions === null ? undefined : String(home.sessions),
    },
    { href: '/pessoas', label: shelf.people, dot: 'bg-genre-green' },
    {
      href: '/notas',
      label: shelf.ratings,
      dot: 'bg-genre-orange',
      count: home.setup ? shelf.given(home.setup.ratings) : undefined,
    },
    { href: '/feedback', label: shelf.feedback, dot: 'bg-genre-violet' },
    { href: '/exportar', label: shelf.export, dot: 'bg-genre-pink' },
    ...(admin
      ? [{ href: '/operacoes', label: shelf.operations, dot: 'bg-ink-2' }]
      : []),
  ]
}

function Guiding({
  first,
  setup,
  home,
}: {
  first: string
  setup: SetupView
  home: HomeData
}) {
  return (
    <>
      <MemberCard name={first} setup={setup} />
      <Guide setup={setup} person={home.person} mcpUrl={home.mcpUrl} />
      <AskEarly />
    </>
  )
}

/** The home page, for the Dono who is logged in. Operações shows only to
 * an admin. */
export function Home({
  name,
  admin,
  home,
}: {
  name: string
  admin: boolean
  home: HomeData
}) {
  const first = name.split(/\s+/u)[0] ?? name
  const setup = home.setup
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-2xl py-2xl">
      <h1 className="font-display text-title">{HOME.greeting(name)}</h1>
      {setup && isGuiding(setup) ? (
        <Guiding first={first} setup={setup} home={home} />
      ) : (
        <>
          {setup && (
            <MemberStrip
              name={first}
              setup={setup}
              person={home.person}
              mcpUrl={home.mcpUrl}
            />
          )}
          <AskBig />
          {home.latest && <Latest session={home.latest} person={home.person} />}
        </>
      )}
      <Shelf items={shelfItems(home, admin)} />
    </main>
  )
}
