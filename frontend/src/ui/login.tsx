import type { LoginRefusal } from '#/content/login-refusal'
import { LOGIN } from './login.copy'
import { Alert } from './kit/status'
import { buttonVariants } from './shadcn/button'

// `/entrar`, the only page without a Dono, so outside the app shell: the
// case-black bar with "filmes", and the membership card shown at the
// counter (DESIGN.md, Home: o guia como carteirinha de sócio) with the one
// orange button. The button is a link, since `/auth/google` answers a GET
// with the redirect to Google.

export function Login({ refusal }: { refusal?: LoginRefusal }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-case">
        <p className="mx-auto flex min-h-[56px] max-w-[1040px] items-center px-2xl font-display text-brand text-case-ink">
          {LOGIN.brand}
        </p>
      </header>
      <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-2xl py-3xl">
        <section
          aria-labelledby="entrar"
          className="flex flex-col gap-xl rounded-panel bg-card-stock px-xl pt-xl pb-2xl text-card-stock-ink"
        >
          <p
            aria-hidden="true"
            className="flex items-baseline justify-between font-display text-[12px] leading-none font-extrabold tracking-[0.08em] uppercase"
          >
            <span>{LOGIN.card}</span>
            <span>{LOGIN.brand}</span>
          </p>
          <h1 id="entrar" className="font-display text-title">
            {LOGIN.title}
          </h1>
          <p className="text-[15px] text-pretty">{LOGIN.lead}</p>
          {refusal && (
            <Alert className="bg-surface text-evidence">
              {LOGIN.refusals[refusal]}
            </Alert>
          )}
          <a
            href="/auth/google"
            className={buttonVariants({ className: 'self-start' })}
          >
            {LOGIN.google}
          </a>
        </section>
      </main>
    </div>
  )
}
