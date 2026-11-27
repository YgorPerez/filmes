import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
} from '@tanstack/react-router'
import css from '../styles.css?url'
// The tab's icon: the orange price sticker on the black case (DESIGN.md,
// Barra do topo), so no request for `/favicon.ico` goes unanswered.
import icon from '#/ui/favicon.svg?url'
import { readOwner } from '#/content/owner'
import { LostAlone, NotFound } from '#/ui/lost'
import { AppShell } from '#/ui/shell'
import { titleOf } from '#/ui/page-title'

export const Route = createRootRoute({
  // Who is logged in, once per navigation: the Dono gate (`_owner.tsx`),
  // `/entrar` and the 404 read it from the context.
  beforeLoad: async () => ({ owner: await readOwner() }),
  // Each page's title, from the deepest match (`ui/page-title.ts`); an
  // address that leads nowhere is "Página não encontrada".
  head: ({ matches }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: titleOf(matches) },
    ],
    // The self-hosted fonts (`platform/fonts.ts`), the same file the MCP
    // Apps view links from the app's origin.
    links: [
      { rel: 'stylesheet', href: '/fonts/fonts.css' },
      { rel: 'stylesheet', href: css },
      { rel: 'icon', type: 'image/svg+xml', href: icon },
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
