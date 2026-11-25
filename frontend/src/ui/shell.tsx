import type { ReactNode } from 'react'
import type { PushStatus } from '@filmes/engine'
import { Icon, type IconName } from './kit/icon'
import { Avatar } from './kit/person'
import { OPERATIONS } from './operations.copy'
import { SHELL } from './shell.copy'

// The app shell (DESIGN.md, Barra do topo e abas): the case-black top bar
// with "filmes" and the Dono's avatar; on the phone the tabs sit fixed at
// the bottom, and from 900px they move up into the top bar. An admin also
// sees, under the bar, the strip of a push that keeps failing. Every Dono
// page sits in it; `/entrar` and the Cartaz's MCP Apps view do not.

type Tab = {
  key: keyof typeof SHELL.items
  href: string
  icon: IconName
  /** The paths it is the current tab for, besides its own. */
  also?: readonly string[]
}

const TABS: readonly Tab[] = [
  { key: 'home', href: '/', icon: 'home' },
  { key: 'sessions', href: '/sessoes', icon: 'film', also: ['/feedback'] },
  { key: 'people', href: '/pessoas', icon: 'people' },
  { key: 'imports', href: '/importar', icon: 'import', also: ['/fila'] },
]
const ADMIN_TAB: Tab = { key: 'operations', href: '/operacoes', icon: 'tools' }

const under = (path: string, root: string) =>
  path === root || path.startsWith(`${root}/`)

/** The tab `path` belongs to: Início only for `/` itself. */
const isCurrent = (tab: Tab, path: string) =>
  tab.href === '/'
    ? path === '/'
    : [tab.href, ...(tab.also ?? [])].some((root) => under(path, root))

/** The icon on the orange disc of the current tab (85%), in `on-sticker`
 * in both themes (The Sticker Ink Rule). */
function TabIcon({ icon, current }: { icon: IconName; current: boolean }) {
  return (
    <span
      className={`grid size-[30px] place-items-center rounded-round ${
        current ? 'bg-sticker-orange/85 text-on-sticker' : ''
      }`}
    >
      <Icon name={icon} />
    </span>
  )
}

function Tabs({
  tabs,
  path,
  place,
}: {
  tabs: readonly Tab[]
  path: string
  place: 'top' | 'bottom'
}) {
  const bottom = place === 'bottom'
  return (
    <nav
      aria-label={SHELL.tabs}
      className={
        bottom
          ? 'fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-surface pb-[max(14px,env(safe-area-inset-bottom))] min-[900px]:hidden'
          : 'hidden min-[900px]:block'
      }
    >
      <ul
        className={
          bottom ? 'mx-auto flex max-w-[720px]' : 'flex items-center gap-2xs'
        }
      >
        {tabs.map((tab) => {
          const current = isCurrent(tab, path)
          return (
            <li key={tab.key} className={bottom ? 'flex-1' : undefined}>
              <a
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`flex items-center font-display no-underline ${
                  bottom
                    ? 'min-h-[54px] flex-col justify-center gap-[3px] pt-[5px] text-tab'
                    : 'min-h-touch gap-xs rounded-nav-row pr-md pl-2xs text-control'
                } ${
                  current
                    ? `font-bold ${bottom ? 'text-ink' : 'text-case-ink'}`
                    : bottom
                      ? 'text-ink-2'
                      : 'text-case-ink-2 hover:text-case-ink'
                }`}
              >
                <TabIcon icon={tab.icon} current={current} />
                {SHELL.items[tab.key]}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/** The strip under the top bar while pushes keep failing (`alert`, after
 * three in a row), for an admin: `surface-2`, ink and the alert icon. */
function PushStrip({ status }: { status: PushStatus }) {
  const copy = OPERATIONS.push
  return (
    <div className="border-b border-rule bg-surface-2 text-ink">
      <p
        role="alert"
        className="mx-auto flex max-w-[720px] items-start gap-sm px-2xl py-md text-meta min-[900px]:max-w-[1040px]"
      >
        <Icon name="alert" className="mt-px size-[18px]" />
        <span>
          {copy.banner(status.pending, status.failures)}{' '}
          <a
            href="/operacoes#envio"
            className="font-semibold text-ink underline underline-offset-3"
          >
            {copy.bannerLink}
          </a>
        </span>
      </p>
    </div>
  )
}

export type ShellOwner = { name: string; admin: boolean }

/** Every Dono page: the top bar, the push strip for an admin, the page,
 * and the tabs. `path` is the page's, to mark its tab. */
export function AppShell({
  owner,
  path,
  alert,
  children,
}: {
  owner: ShellOwner
  path: string
  alert: PushStatus | null
  children: ReactNode
}) {
  const tabs = owner.admin ? [...TABS, ADMIN_TAB] : TABS
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case text-case-ink">
        <div className="mx-auto flex min-h-[56px] max-w-[1040px] items-center gap-3xl px-2xl py-sm">
          <a
            href="/"
            aria-label={SHELL.home}
            className="font-display text-brand text-case-ink no-underline"
          >
            {SHELL.brand}
          </a>
          <Tabs tabs={tabs} path={path} place="top" />
          <div className="ml-auto flex items-center gap-xs">
            <span
              role="img"
              aria-label={SHELL.you(owner.name)}
              className="grid place-items-center rounded-round ring-2 ring-case"
            >
              <Avatar
                person={{
                  color: 1,
                  initial: owner.name.slice(0, 1).toUpperCase(),
                  name: owner.name,
                }}
              />
            </span>
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                className="min-h-touch cursor-pointer px-sm font-display text-control text-case-ink-2 underline underline-offset-3 hover:text-case-ink"
              >
                {SHELL.logout}
              </button>
            </form>
          </div>
        </div>
      </header>
      {alert && <PushStrip status={alert} />}
      <div className="flex-1 pb-[calc(68px+env(safe-area-inset-bottom))] min-[900px]:pb-0">
        {children}
      </div>
      <Tabs tabs={tabs} path={path} place="bottom" />
    </div>
  )
}
