import type { ReactNode } from 'react'
import type { PushStatus } from '@filmes/engine'
import { Icon, type IconName } from './kit/icon'
import { MENU_ROW } from './kit/menu-row'
import { Avatar } from './kit/person'
import { CREDITS_PATH, SiteFooter } from './kit/site-footer'
import { Alert } from './kit/status'
import { OPERATIONS } from './operations.copy'
import { SHELL } from './shell.copy'

// The app shell (DESIGN.md, Barra do topo e abas): the case-black top bar
// with "filmes" and the Dono's avatar, which opens her menu (Operações for
// an admin, and Sair); on the phone the four tabs sit fixed at the bottom,
// and from 900px they move up into the top bar. An admin also sees, under
// the bar, the strip of a push that keeps failing. Under the page, the
// footer with the sources' credits (#292). Every Dono page sits in it;
// `/entrar` and the Cartaz's MCP Apps view do not. The bar and the footer
// share the page's column (720px, or 1040px for a `wide` page), so at the
// desktop "filmes", the page and the footer start on one left edge.
// `OutsideShell` is the frame of a page with no Dono: the bar with
// "filmes" alone, the page and the footer.

type Tab = {
  key: keyof typeof SHELL.items
  href: string
  icon: IconName
  /** The paths it is the current tab for, besides its own. */
  also?: readonly string[]
}

const TABS: readonly Tab[] = [
  { key: 'home', href: '/', icon: 'home' },
  { key: 'sessions', href: '/sessoes', icon: 'film' },
  { key: 'people', href: '/pessoas', icon: 'people' },
  // `/trakt` is reached from Meu gosto's imports (#274).
  { key: 'taste', href: '/meu-gosto', icon: 'taste', also: ['/trakt'] },
]

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

function Tabs({ path, place }: { path: string; place: 'top' | 'bottom' }) {
  const bottom = place === 'bottom'
  return (
    <nav
      aria-label={SHELL.tabs}
      className={
        bottom
          ? 'fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-surface pb-tab-safe min-[900px]:hidden'
          : 'hidden min-[900px]:block'
      }
    >
      <ul
        className={
          bottom ? 'mx-auto flex max-w-[720px]' : 'flex items-center gap-2xs'
        }
      >
        {TABS.map((tab) => {
          const current = isCurrent(tab, path)
          return (
            <li key={tab.key} className={bottom ? 'flex-1' : undefined}>
              <a
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={`flex items-center font-display no-underline ${
                  bottom
                    ? 'min-h-[54px] flex-col justify-center gap-0.75 pt-1.25 text-tab'
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
function PushStrip({ status, wide }: { status: PushStatus; wide: boolean }) {
  const copy = OPERATIONS.push
  return (
    <div className="border-b border-rule bg-surface-2 text-ink">
      <Alert
        strip
        className={`mx-auto px-2xl py-md text-meta ${wide ? 'max-w-[720px] min-[900px]:max-w-[1040px]' : 'max-w-[720px]'}`}
      >
        {copy.banner(status.pending, status.failures)}{' '}
        <a
          href="/operacoes#envio"
          className="font-semibold text-ink underline underline-offset-3"
        >
          {copy.bannerLink}
        </a>
      </Alert>
    </div>
  )
}

export type ShellOwner = { name: string; admin: boolean; email: string }

/** The Dono's avatar, a button that opens her menu: her name and the
 * Google e-mail she entered with, Operações for an admin (saying so while
 * the push keeps failing), and Sair by POST. A native popover: it opens
 * without the JavaScript, and a tap outside or Esc closes it. On a page of
 * the menu (Operações), the avatar is the current place: `aria-current` and
 * the tabs' orange disc behind it. */
function AccountMenu({
  owner,
  alert,
  current,
  wide,
}: {
  owner: ShellOwner
  alert: PushStatus | null
  current: boolean
  wide: boolean
}) {
  return (
    <>
      <button
        type="button"
        popoverTarget="conta"
        aria-label={SHELL.account(owner.name)}
        aria-current={current ? 'page' : undefined}
        className={`grid size-touch cursor-pointer place-items-center rounded-round ${
          current ? 'bg-sticker-orange/85' : ''
        }`}
      >
        <span className="grid place-items-center rounded-round ring-2 ring-case">
          <Avatar
            person={{
              color: 1,
              initial: owner.name.slice(0, 1).toUpperCase(),
              name: owner.name,
            }}
          />
        </span>
      </button>
      <nav
        id="conta"
        popover="auto"
        aria-label={SHELL.menu}
        className={`fixed inset-auto top-[60px] m-0 w-[240px] rounded-card border border-rule bg-surface p-xs text-ink ${
          wide
            ? 'right-[max(16px,calc((100vw-1040px)/2+16px))]'
            : 'right-[max(16px,calc((100vw-720px)/2+16px))]'
        }`}
      >
        <div className="px-md pt-sm pb-xs">
          <p className="truncate font-display text-row-title">{owner.name}</p>
          <p className="truncate text-meta text-ink-2">
            <span className="sr-only">{SHELL.signedInAs} </span>
            {owner.email}
          </p>
        </div>
        <ul className="flex flex-col">
          {owner.admin && (
            <li>
              <a
                href="/operacoes"
                aria-current={current ? 'page' : undefined}
                className={MENU_ROW}
              >
                <Icon name="tools" />
                {SHELL.operations}
                {alert && (
                  <span className="ml-auto inline-flex items-center gap-2xs font-body text-meta text-ink-2">
                    <Icon name="alert" className="size-4" />
                    {SHELL.pushFailing}
                  </span>
                )}
              </a>
            </li>
          )}
          <li>
            <form method="post" action="/auth/logout">
              <button type="submit" className={MENU_ROW}>
                <Icon name="logout" />
                {SHELL.logout}
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </>
  )
}

/** "filmes", leading home, in the 44px link of the bar. */
function Brand() {
  return (
    <a
      href="/"
      aria-label={SHELL.home}
      className="inline-flex min-h-touch items-center font-display text-brand text-case-ink no-underline"
    >
      {SHELL.brand}
    </a>
  )
}

const BAR = 'mx-auto flex min-h-[56px] items-center px-2xl py-2xs'

/** Every Dono page: the top bar, the push strip for an admin, the page,
 * the footer, and the tabs. `path` is the page's, to mark its tab (`""`
 * marks none). `wide`: the page's column is 1040px from 900px (Meu gosto,
 * a Pessoa, Operações). */
export function AppShell({
  owner,
  path,
  alert,
  wide = false,
  children,
}: {
  owner: ShellOwner
  path: string
  alert: PushStatus | null
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case text-case-ink">
        <div
          className={`${BAR} gap-2xl ${wide ? 'max-w-[720px] min-[900px]:max-w-[1040px]' : 'max-w-[720px]'}`}
        >
          <Brand />
          <Tabs path={path} place="top" />
          <div className="ml-auto flex items-center">
            <AccountMenu
              owner={owner}
              alert={alert}
              current={under(path, '/operacoes')}
              wide={wide}
            />
          </div>
        </div>
      </header>
      {/* On Operações the push's own section says it, first. */}
      {alert && !under(path, '/operacoes') && (
        <PushStrip status={alert} wide={wide} />
      )}
      <div className="flex flex-1 flex-col pb-tab-clearance min-[900px]:pb-0">
        <div>{children}</div>
        <SiteFooter
          width={wide ? 'wide' : 'page'}
          current={path === CREDITS_PATH}
        />
      </div>
      <Tabs path={path} place="bottom" />
    </div>
  )
}

/** A page with no Dono (the 404 and the error outside the shell,
 * `/creditos` logged out): the case-black bar with "filmes" leading home,
 * over the page, in the 720px column, and the footer. The page carries its
 * own way in, so the bar has no Entrar. `path` is the page's, so the
 * footer knows when it is on the credits. */
export function OutsideShell({
  path = '',
  children,
}: {
  path?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case text-case-ink">
        <div className={`${BAR} max-w-[720px]`}>
          <Brand />
        </div>
      </header>
      {children}
      <SiteFooter current={path === CREDITS_PATH} />
    </div>
  )
}
