import type { LoginRefusal } from '#/content/login-refusal'
import {
  TRAKT_CONNECT,
  TRAKT_DISCONNECT,
  type TraktError,
} from '#/content/trakt-form'
import { LOGIN, TRAKT_SCREEN } from './login.copy'
import { ShelfLabel } from './kit/shelf-label'
import { Alert } from './kit/status'
import { buttonVariants } from './kit/button-variants'
import { SiteFooter } from './kit/site-footer'
import { Slip } from './kit/slip'
import { Button } from './shadcn/button'

// The pages without a Dono, so outside the app shell: `/entrar` and `/trakt`.
//
// `/entrar`: the case-black bar with "filmes" and one card with the one
// orange button. The button is a link, since `/auth/google` answers a GET with the
// redirect to Google; it goes when sign-in is off here, since Google
// would only send the visitor back. Both pages end with the footer that
// links the sources' credits.

export function Login({ refusal }: { refusal?: LoginRefusal }) {
  const googleLabel = refusal === 'nao-dono' ? LOGIN.otherAccount : LOGIN.google

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case">
        <p className="mx-auto flex min-h-[56px] max-w-[1040px] items-center px-2xl font-display text-brand text-case-ink">
          {LOGIN.brand}
        </p>
      </header>
      <main className="mx-auto w-full max-w-[464px] px-2xl pt-14 pb-3xl sm:pt-24">
        <section
          aria-labelledby="entrar"
          className="overflow-hidden rounded-panel"
        >
          <div className="bg-case p-xs">
            <ShelfLabel items={LOGIN.tagline} label={LOGIN.taglineLabel} />
          </div>
          <div className="flex flex-col gap-2xl bg-card-stock p-2xl text-card-stock-ink sm:p-3xl">
            <h1 id="entrar" className="font-display text-counter-title">
              {LOGIN.title}
            </h1>
            {refusal ? (
              <Alert className="bg-surface text-evidence">
                {LOGIN.refusals[refusal]}
              </Alert>
            ) : (
              <p className="text-balance">{LOGIN.lead}</p>
            )}
            {refusal !== 'indisponivel' && (
              <a
                href="/auth/google"
                className={buttonVariants({ className: 'sm:self-start' })}
              >
                {googleLabel}
              </a>
            )}
            {refusal !== 'nao-dono' && (
              <p className="border-t border-dashed border-card-stock-ink/40 pt-lg text-meta text-pretty">
                {LOGIN.access}
              </p>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

// `/trakt` (#295): any Pessoa with an email signs in with Google, consents
// and connects her own Trakt, or disconnects it.

type TraktPage =
  | { status: 'unavailable' }
  | { status: 'login' }
  | { status: 'connected' | 'disconnected'; name: string }

export function TraktScreen({
  page,
  error,
}: {
  page: TraktPage
  error?: TraktError
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-[720px] flex-col gap-xl px-2xl py-3xl">
        <h1 className="font-display text-counter-title">
          {TRAKT_SCREEN.title}
        </h1>
        {error && <Alert>{TRAKT_SCREEN.errors[error]}</Alert>}
        <Slip id="trakt-history" title={TRAKT_SCREEN.slip}>
          <div className="flex flex-col items-start gap-lg">
            {page.status === 'unavailable' ? (
              <p>{TRAKT_SCREEN.unavailable}</p>
            ) : page.status === 'login' ? (
              <>
                <p>{TRAKT_SCREEN.login}</p>
                <a
                  href="/auth/trakt-google"
                  className={buttonVariants({ variant: 'primary' })}
                >
                  {TRAKT_SCREEN.google}
                </a>
              </>
            ) : (
              <>
                <p className="font-semibold">{page.name}</p>
                {page.status === 'connected' ? (
                  <>
                    <p>{TRAKT_SCREEN.connected}</p>
                    <form action={TRAKT_DISCONNECT} method="post">
                      <Button type="submit" variant="option">
                        {TRAKT_SCREEN.disconnect}
                      </Button>
                    </form>
                  </>
                ) : (
                  <form
                    action={TRAKT_CONNECT}
                    method="post"
                    className="flex flex-col items-start gap-lg"
                  >
                    <label className="flex items-start gap-sm">
                      <input
                        type="checkbox"
                        name="consentir"
                        value="sim"
                        required
                        className="mt-1"
                      />
                      {TRAKT_SCREEN.consent}
                    </label>
                    <Button type="submit">{TRAKT_SCREEN.connect}</Button>
                  </form>
                )}
              </>
            )}
          </div>
        </Slip>
        <p className="text-meta text-ink-2">{TRAKT_SCREEN.notice}</p>
      </main>
      <SiteFooter />
    </div>
  )
}
