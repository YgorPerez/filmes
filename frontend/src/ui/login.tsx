import type { LoginRefusal } from '#/content/login-refusal'
import { LOGIN } from './login.copy'
import { Alert } from './kit/status'
import { buttonVariants } from './kit/button-variants'
import { SiteFooter } from './kit/site-footer'

// `/entrar`, the only page without a Dono, so outside the app shell: the
// case-black bar with "filmes" and one card with the one orange button.
// The button is a link, since `/auth/google` answers a GET with the
// redirect to Google; it goes when sign-in is off here, since Google
// would only send the visitor back. The footer links the sources' credits.

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
            <h1
              id="entrar"
              className="rounded-cover bg-shelf-label px-lg py-sm font-display text-counter-title text-on-sticker"
            >
              {LOGIN.title}
            </h1>
          </div>
          <div className="flex flex-col gap-2xl bg-card-stock p-2xl text-card-stock-ink sm:p-3xl">
            {refusal ? (
              <Alert className="bg-surface text-evidence">
                {LOGIN.refusals[refusal]}
              </Alert>
            ) : (
              <p className="text-pretty">{LOGIN.lead}</p>
            )}
            {refusal !== 'indisponivel' && (
              <a
                href="/auth/google"
                className={buttonVariants({ className: 'sm:self-start' })}
              >
                {googleLabel}
              </a>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
