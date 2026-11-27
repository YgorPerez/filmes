import { createFileRoute, Outlet } from '@tanstack/react-router'
import { readSessionLink } from '#/content/session-link'
import {
  askedLinkPage,
  pickedLinkPath,
  sessionLinkHeaders,
  sessionLinkHome,
  sessionLinkPath,
  sessionLinkSearch,
} from '#/content/session-link-address'
import { SiteFooter } from '#/ui/kit/site-footer'
import { LinkHeader, LinkPicker, LinkUnavailable } from '#/ui/session-link'
import { PARTICIPATION } from '#/ui/session-link.copy'

export const Route = createFileRoute('/participar')({
  validateSearch: sessionLinkSearch,
  // `home`: the link's film list for the chosen Presente, where the child
  // pages go back to. `closed`: the link was issued, but its Session has
  // closed since, with the film it ended with.
  beforeLoad: async ({ search, location }) => {
    const { link, closed } = await readSessionLink({ data: search })
    return {
      participation: link,
      closed,
      home: sessionLinkHome(search),
      asked: askedLinkPage(location.pathname),
    }
  },
  // The link's preview in a chat: who calls and with whom.
  loader: ({ context: { participation, closed } }) => ({
    title: participation?.selected
      ? PARTICIPATION.films
      : participation
        ? PARTICIPATION.pick
        : closed
          ? PARTICIPATION.unavailable.closed
          : PARTICIPATION.unavailable.broken,
    preview: participation
      ? PARTICIPATION.preview(
          participation.owner,
          participation.attendees.map((p) => p.name),
        )
      : null,
  }),
  head: ({ loaderData }) => ({
    meta: loaderData?.preview
      ? [
          { property: 'og:title', content: loaderData.preview.title },
          {
            property: 'og:description',
            content: loaderData.preview.description,
          },
          { name: 'description', content: loaderData.preview.description },
        ]
      : [],
  }),
  headers: () => sessionLinkHeaders,
  component: SessionLinkRoute,
})

function SessionLinkRoute() {
  const { participation, closed, asked } = Route.useRouteContext()
  const { chave, presente } = Route.useSearch()
  return (
    <div className="flex min-h-dvh flex-col bg-ground">
      <main className="mx-auto flex w-full max-w-[640px] flex-col gap-xl px-2xl py-3xl max-[480px]:px-lg">
        {!participation || !chave ? (
          <LinkUnavailable closed={closed} />
        ) : participation.selected ? (
          <>
            <LinkHeader
              person={participation.selected}
              notYou={sessionLinkPath(participation.session, chave)}
            />
            <Outlet />
          </>
        ) : (
          <LinkPicker
            view={participation}
            hrefFor={(person) =>
              pickedLinkPath(participation.session, chave, person, asked)
            }
            unknown={presente !== undefined}
          />
        )}
      </main>
      <SiteFooter width="link" />
    </div>
  )
}
