import { createFileRoute, Outlet } from '@tanstack/react-router'
import { readSessionLink } from '#/content/session-link'
import {
  sessionLinkHeaders,
  sessionLinkPath,
  sessionLinkSearch,
} from '#/content/session-link-address'
import { buttonVariants } from '#/ui/kit/button-variants'
import { SiteFooter } from '#/ui/kit/site-footer'
import { PARTICIPATION } from '#/ui/session-link.copy'

export const Route = createFileRoute('/participar')({
  validateSearch: sessionLinkSearch,
  // `home`: the link's film list for the chosen Presente, where the child
  // pages go back to.
  beforeLoad: async ({ search: { sessao, chave, presente } }) => ({
    participation: await readSessionLink({ data: { sessao, chave, presente } }),
    home: sessao && chave ? sessionLinkPath(sessao, chave, presente) : null,
  }),
  headers: () => sessionLinkHeaders,
  component: SessionLinkRoute,
})

function SessionLinkRoute() {
  const { participation } = Route.useRouteContext()
  const { chave } = Route.useSearch()
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-xl px-2xl py-3xl">
        {!participation || !chave ? (
          <h1 className="font-display text-title">
            {PARTICIPATION.unavailable}
          </h1>
        ) : participation.selected ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-lg">
              <p className="font-display text-step-title">
                {participation.selected.name}
              </p>
              <a
                href={sessionLinkPath(participation.session, chave)}
                className={buttonVariants({ variant: 'option' })}
              >
                {PARTICIPATION.change}
              </a>
            </header>
            <Outlet />
          </>
        ) : (
          <>
            <h1 className="font-display text-title">{PARTICIPATION.pick}</h1>
            <ul className="flex flex-col gap-sm">
              {participation.attendees.map(({ person, name }) => (
                <li key={person}>
                  <a
                    href={sessionLinkPath(participation.session, chave, person)}
                    className={buttonVariants({
                      variant: 'option',
                      className: 'w-full justify-start',
                    })}
                  >
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
