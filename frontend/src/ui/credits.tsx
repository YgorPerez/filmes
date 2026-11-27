import type { ReactNode } from 'react'
import type { Credit } from '@filmes/engine'
import { CREDIT_USES, CREDITS_PAGE } from './credits.copy'
import { PageHead } from './kit/page-head'
import tmdbLogo from './tmdb-logo.svg?url'

// `/creditos` (#292): every source filmes reads, linked, with what it gives
// (`CREDIT_USES`) and the notice its terms ask for, word for word (`CREDITS`
// in the engine), its addresses as links. Open to anyone and reached from
// every page's footer: the route puts it in the app shell for a Dono and
// in `OutsideShell` for anyone else. TMDB's terms also ask for its logo,
// smaller than the "filmes" of the bar: its approved short logo, 14px
// high, is TMDB's name in the heading.

/** TMDB's approved "blue short" logo
 * (themoviedb.org/about/logos-attribution), the file as TMDB serves it.
 * It names the source, so the heading does not write "TMDB" twice. */
function TmdbLogo() {
  return (
    <img src={tmdbLogo} alt="TMDB" data-logo="tmdb" className="h-3.5 w-auto" />
  )
}

/** An address in a notice, up to a space or a parenthesis, without the
 * sentence's closing stop. */
const ADDRESS = /https?:\/\/[^\s()]+[^\s().,;]/g

/** The notice word for word, each address in it a link. */
function Notice({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(ADDRESS)) {
    const [url] = match
    parts.push(text.slice(last, match.index))
    parts.push(
      <a
        key={match.index}
        href={url}
        className="text-ink-2 underline underline-offset-2 hover:text-ink"
      >
        {url}
      </a>,
    )
    last = match.index + url.length
  }
  parts.push(text.slice(last))
  return (
    <p className="text-source text-pretty break-words text-ink-2">{parts}</p>
  )
}

/** The page itself, the column under the bar. */
export function Credits({ credits }: { credits: readonly Credit[] }) {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-3xl px-2xl py-3xl">
      <PageHead title={CREDITS_PAGE.title} lead={CREDITS_PAGE.lead} />
      <ul aria-label={CREDITS_PAGE.sources} className="flex flex-col gap-xl">
        {credits.map(({ source, url, notice }) => (
          <li
            key={source}
            className="flex flex-col gap-xs border-t border-rule pt-lg"
          >
            <h2 className="font-display text-row-title">
              {/* A 44px target that takes the line's height in the layout,
                  so the name sits on its line. */}
              <a
                href={url}
                className="-my-[11px] inline-flex min-h-touch items-center text-ink underline underline-offset-3"
              >
                {source === 'TMDB' ? <TmdbLogo /> : source}
              </a>
            </h2>
            <p className="text-pretty text-ink-2">{CREDIT_USES[source]}</p>
            {notice && <Notice text={notice} />}
          </li>
        ))}
      </ul>
    </main>
  )
}
