import type { ReactNode } from 'react'
import { buttonVariants } from './kit/button-variants'
import { SiteFooter } from './kit/site-footer'
import { LOST } from './lost.copy'

// The pages for an address that leads nowhere (DESIGN.md, Página perdida,
// #268): a 404 and the error of a page that failed to open, in the shop's
// voice, with the way back. Inside the app shell they are only the page;
// outside it (no Dono, or the guest pages) `LostAlone` adds the case-black
// bar with "filmes" and the footer, and the way in is Entrar. Neither says
// why the address leads nowhere (a page only an admin opens is a 404 like
// any other).

function Page({
  title,
  lead,
  children,
}: {
  title: string
  lead: string
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-2xl px-2xl py-3xl">
      <div className="flex flex-col gap-xs">
        <h1 className="font-display text-page-title text-balance">{title}</h1>
        <p className="max-w-[60ch] text-pretty text-ink-2">{lead}</p>
      </div>
      <div className="flex flex-wrap items-center gap-md">{children}</div>
    </main>
  )
}

/** The 404: the one orange "Ir para o início", and Ver Sessões for a Dono.
 * A Sessão that does not exist (`what="session"`) says so. Logged out
 * (`owner={false}`), the way in is Entrar, and the lead names no Sessão. */
export function NotFound({
  owner = true,
  what = 'page',
}: {
  owner?: boolean
  what?: 'page' | 'session'
}) {
  if (!owner)
    return (
      <Page title={LOST.notFound.title} lead={LOST.notFoundAlone.lead}>
        <a href="/entrar" className={buttonVariants()}>
          {LOST.notFoundAlone.signIn}
        </a>
      </Page>
    )
  const copy = what === 'session' ? LOST.sessionNotFound : LOST.notFound
  return (
    <Page title={copy.title} lead={copy.lead}>
      <a href="/" className={buttonVariants()}>
        {copy.home}
      </a>
      <a href="/sessoes" className={buttonVariants({ variant: 'option' })}>
        {copy.sessions}
      </a>
    </Page>
  )
}

/** A page that failed to open: Tentar de novo loads it again (`onRetry`),
 * and the way home. */
export function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const copy = LOST.error
  return (
    <Page title={copy.title} lead={copy.lead}>
      <button type="button" onClick={onRetry} className={buttonVariants()}>
        {copy.retry}
      </button>
      <a href="/" className={buttonVariants({ variant: 'option' })}>
        {copy.home}
      </a>
    </Page>
  )
}

/** Outside the app shell: the case-black bar with "filmes" leading home,
 * as on /entrar, over the page, and the footer with the sources' credits.
 * The page carries Entrar, so the bar does not repeat it. */
export function LostAlone({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case text-case-ink">
        <div className="mx-auto flex min-h-[56px] max-w-[1040px] items-center gap-3xl px-2xl py-2xs">
          <a
            href="/"
            aria-label={LOST.home}
            className="inline-flex min-h-touch items-center font-display text-brand text-case-ink no-underline"
          >
            {LOST.brand}
          </a>
        </div>
      </header>
      {children}
      <SiteFooter />
    </div>
  )
}
