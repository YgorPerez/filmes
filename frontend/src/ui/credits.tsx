import type { Credit } from '@filmes/engine'
import { CREDIT_USES, CREDITS_PAGE } from './credits.copy'
import { PageHead } from './kit/page-head'
import tmdbLogo from './tmdb-logo.svg?url'

// `/creditos` (#292): every source filmes reads, linked, with what it gives
// (`CREDIT_USES`) and the notice its terms ask for, word for word (`CREDITS`
// in the engine). Public, outside the app shell like `/entrar`, and reached from
// every page's footer. TMDB's terms also ask for its logo, smaller than the
// "filmes" of the bar: its approved short logo, 12px high.

/** TMDB's approved "blue short" logo
 * (themoviedb.org/about/logos-attribution), the file as TMDB serves it.
 * Beside the name, so the link reads "TMDB" once. */
function TmdbLogo() {
  return <img src={tmdbLogo} alt="" data-logo="tmdb" className="h-3 w-auto" />
}

export function Credits({ credits }: { credits: readonly Credit[] }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case">
        <div className="mx-auto flex min-h-[56px] max-w-[1040px] items-center px-2xl">
          <a
            href="/"
            aria-label={CREDITS_PAGE.home}
            className="font-display text-brand text-case-ink no-underline"
          >
            {CREDITS_PAGE.brand}
          </a>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-3xl px-2xl py-3xl">
        <PageHead title={CREDITS_PAGE.title} lead={CREDITS_PAGE.lead} />
        <ul aria-label={CREDITS_PAGE.sources} className="flex flex-col gap-xl">
          {credits.map(({ source, url, notice }) => (
            <li
              key={source}
              className="flex flex-col gap-2xs border-t border-rule pt-lg"
            >
              <h2 className="font-display text-row-title">
                <a
                  href={url}
                  className="inline-flex min-h-touch items-center gap-sm text-ink underline underline-offset-3"
                >
                  {source}
                  {source === 'TMDB' && <TmdbLogo />}
                </a>
              </h2>
              <p className="text-pretty text-ink-2">{CREDIT_USES[source]}</p>
              {notice && (
                <p className="text-source text-pretty break-words text-ink-2">
                  {notice}
                </p>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
