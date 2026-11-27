import type { LoginRefusal } from '#/content/login-refusal'
import {
  TRAKT_CONNECT,
  TRAKT_DISCONNECT,
  type TraktError,
} from '#/content/trakt-form'
import { MY_TASTE } from '#/content/paths'
import { LOGIN, TRAKT_SCREEN as TRAKT } from './login.copy'
import { ShelfLabel } from './kit/shelf-label'
import { Alert } from './kit/status'
import { buttonVariants } from './kit/button-variants'
import { SiteFooter } from './kit/site-footer'
import { Slip } from './kit/slip'
import { Button } from './shadcn/button'

// The pages without a Dono, so outside the app shell: `/entrar`, and
// `/trakt` for a Pessoa who is not a Dono (a Dono sees it in the shell).
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
  inApp = false,
}: {
  page: TraktPage
  error?: TraktError
  /** A Dono is logged in: the page sits in the app shell, with the way
   * back to Importar (#274). */
  inApp?: boolean
}) {
  const body = (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-xl px-2xl py-3xl">
      {inApp && (
        <a
          href={`${MY_TASTE}/importar`}
          className={buttonVariants({
            variant: 'option',
            className: 'self-start',
          })}
        >
          {TRAKT.back}
        </a>
      )}
      <h1 className="font-display text-counter-title">{TRAKT.heading}</h1>
      {error && <Alert>{TRAKT.errors[error]}</Alert>}
      <Slip id="trakt-history" title={TRAKT.title}>
        <div className="flex flex-col items-start gap-lg">
          <TraktBody page={page} />
        </div>
      </Slip>
      <p className="text-meta text-ink-2">{TRAKT.notEndorsed}</p>
    </main>
  )
  if (inApp) return body
  return (
    <div className="flex min-h-dvh flex-col">
      {body}
      <SiteFooter />
    </div>
  )
}

/** What the connection holds: sign in, consent and connect, or the
 * connected account and the way to disconnect it. */
function TraktBody({ page }: { page: TraktPage }) {
  if (page.status === 'unavailable') return <p>{TRAKT.unavailable}</p>
  if (page.status === 'login')
    return (
      <>
        <p>{TRAKT.login}</p>
        <a
          href="/auth/trakt-google"
          className={buttonVariants({ variant: 'primary' })}
        >
          {TRAKT.google}
        </a>
      </>
    )
  return (
    <>
      <p className="font-semibold">{page.name}</p>
      {page.status === 'connected' ? (
        <>
          <p>{TRAKT.connected}</p>
          <form action={TRAKT_DISCONNECT} method="post">
            <Button type="submit" variant="option">
              {TRAKT.disconnect}
            </Button>
          </form>
        </>
      ) : (
        <form
          action={TRAKT_CONNECT}
          method="post"
          className="flex w-full flex-col items-start gap-lg"
        >
          <TraktConsent />
          <label className="flex min-h-touch w-full cursor-pointer items-center gap-md rounded-field bg-surface-2 px-lg py-sm">
            <input
              type="checkbox"
              name="consentir"
              value="sim"
              required
              className="size-5 shrink-0 accent-ink"
            />
            <span>{TRAKT.consent}</span>
          </label>
          <Button type="submit">{TRAKT.connect}</Button>
          <p className="text-meta text-ink-2">{TRAKT.after}</p>
        </form>
      )}
    </>
  )
}

/** What the connection reads and what it sends, apart (#274). */
function TraktConsent() {
  return (
    <div className="flex flex-col gap-sm">
      {TRAKT.does.map(({ title, items }) => (
        <div key={title} className="flex flex-col gap-2xs">
          <p className="font-display text-field-label">{title}</p>
          <ul className="flex list-disc flex-col gap-2xs pl-2xl text-evidence">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
