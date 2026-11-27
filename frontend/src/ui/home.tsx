import type { HomeData } from '#/platform/setup-guide'
import { Ask, Guide, Latest, NoSession } from './home-parts'
import { isGuiding } from './setup-steps'

// The home in the Locadora de bairro (DESIGN.md, Home): the counter where
// the Dono asks for a film, the latest Sessão she was in with its pending
// Feedback (or, with none and no guide, where it will show), and the setup
// guide while a step is pending. No list of
// screens: the tabs are the way to every other one (map #218).

/** The home page, for the Dono who is logged in. */
export function Home({ home }: { home: HomeData }) {
  const setup = home.setup
  const guiding = setup !== null && isGuiding(setup)
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-2xl px-2xl py-2xl">
      <Ask />
      {home.latest ? (
        <Latest
          session={home.latest}
          person={home.person}
          today={home.today}
          covers={home.covers}
        />
      ) : (
        !guiding && <NoSession />
      )}
      {setup && guiding && (
        <Guide
          setup={setup}
          person={home.person}
          mcpUrl={home.mcpUrl}
          fold={home.latest !== null}
        />
      )}
    </main>
  )
}
