import { SITE_FOOTER } from './site-footer.copy'

// The footer under every page a person opens (the Dono's, `/entrar` and the
// Session link's): one link, to the sources' credits (#292). The
// attributions the sources ask for live there, never on the cards.

/** The credits page's route (`routes/creditos.tsx`). */
const CREDITS_PATH = '/creditos'

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule">
      <div className="mx-auto max-w-[1040px] px-2xl py-md text-meta">
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
