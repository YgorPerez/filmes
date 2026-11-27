import { SITE_FOOTER } from './site-footer.copy'

// The footer under every page a person opens (the Dono's, `/entrar` and the
// Session link's): one link, to the sources' credits (#292). The
// attributions the sources ask for live there, never on the cards.

/** The credits page's route (`routes/creditos.tsx`). */
const CREDITS_PATH = '/creditos'

/** The page's column, so the footer shares its left edge: `page` the
 * 720px of most pages, `wide` the 1040px of a two-column page from 900px,
 * `link` the Session link's 640px, `card` the 464px of `/entrar`'s card. */
const WIDTHS = {
  page: 'max-w-[720px]',
  wide: 'max-w-[720px] min-[900px]:max-w-[1040px]',
  link: 'max-w-[640px] max-[480px]:px-lg',
  card: 'max-w-[464px]',
} as const

export function SiteFooter({
  width = 'page',
}: {
  width?: keyof typeof WIDTHS
}) {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className={`mx-auto px-2xl py-md text-meta ${WIDTHS[width]}`}>
        <a
          href={CREDITS_PATH}
          className="inline-flex min-h-touch items-center text-ink-2 underline underline-offset-3 hover:text-ink"
        >
          {SITE_FOOTER.credits}
        </a>
      </div>
    </footer>
  )
}
