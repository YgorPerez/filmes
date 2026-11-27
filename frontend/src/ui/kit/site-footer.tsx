import { SITE_FOOTER } from './site-footer.copy'

// The footer under every page a person opens (the Dono's, `/entrar` and the
// Session link's): one link, to the sources' credits (#292). The
// attributions the sources ask for live there, never on the cards.

/** The credits page's route (`routes/creditos.tsx`). */
const CREDITS_PATH = '/creditos'

/** `narrow`: the Session link's 640px column, so the footer shares the
 * page's left edge. */
export function SiteFooter({ narrow = false }: { narrow?: boolean }) {
  return (
    <footer className="mt-auto border-t border-rule">
      <div
        className={`mx-auto px-2xl py-md text-meta ${narrow ? 'max-w-[640px] max-[480px]:px-lg' : 'max-w-[1040px]'}`}
      >
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
