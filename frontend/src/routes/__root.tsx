import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
} from '@tanstack/react-router'
import css from '../styles.css?url'
import { readOwner } from '#/content/owner'
import { LostAlone, NotFound } from '#/ui/lost'
import { AppShell } from '#/ui/shell'
import { PAGE_TITLES, pageTitle } from '#/ui/page-title'

// The tab's icon: the orange price sticker on the black case, inline, so no
// request for it (and no `/favicon.ico` 404).
const ICON = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#17181b'/><circle cx='16' cy='16' r='9' fill='#ff7a1a'/></svg>",
)}`

export const Route = createRootRoute({
  // Who is logged in, once per navigation: the Dono gate (`_owner.tsx`),
  // `/entrar` and the 404 read it from the context.
  beforeLoad: async () => ({ owner: await readOwner() }),
  // A page names itself in its route's `head` (`ui/page-title.ts`); an
  // address that leads nowhere is "Página não encontrada".
  head: ({ matches }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: pageTitle(
          matches.some((m) => m.status === 'notFound' || m._notFound === true)
            ? PAGE_TITLES.notFound
            : null,
        ),
      },
    ],
    // The self-hosted fonts (`platform/fonts.ts`), the same file the MCP
    // Apps view links from the app's origin.
    links: [
      { rel: 'stylesheet', href: '/fonts/fonts.css' },
      { rel: 'stylesheet', href: css },
      { rel: 'icon', type: 'image/svg+xml', href: ICON },
    ],
  }),
  component: Root,
  notFoundComponent: RootNotFound,
})

/** An address no route has: inside the app shell for a Dono, and with the
 * bar and Entrar for anyone else. */
function RootNotFound() {
  const { owner } = Route.useRouteContext()
  const { pathname } = useLocation()
  if (!owner)
    return (
      <LostAlone>
        <NotFound owner={false} />
      </LostAlone>
    )
  return (
    <AppShell owner={owner} path={pathname} alert={null}>
      <NotFound />
    </AppShell>
  )
}

function Root() {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
