import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import css from '../styles.css?url'
import { PAGE_TITLES, pageTitle } from '#/ui/page-title'

// The tab's icon: the orange price sticker on the black case, inline, so no
// request for it (and no `/favicon.ico` 404).
const ICON = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#17181b'/><circle cx='16' cy='16' r='9' fill='#ff7a1a'/></svg>",
)}`

export const Route = createRootRoute({
  // A page names itself in its route's `head` (`ui/page-title.ts`); an
  // address that leads nowhere is "Página não encontrada".
  head: ({ matches }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      {
        title: pageTitle(
          matches.some((m) => m.status === 'notFound')
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
})

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
