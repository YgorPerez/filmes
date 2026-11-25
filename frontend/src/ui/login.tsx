import type { LoginRefusal } from '#/content/login-refusal'
import { LOGIN } from './login.copy'
import { Brand } from './kit/brand'
import { buttonVariants } from './shadcn/button'

/** `/entrar`: the only page without a Dono. The button is a link, since
 * `/auth/google` answers a GET with the redirect to Google. */
export function Login({ refusal }: { refusal?: LoginRefusal }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-3xl px-2xl py-3xl">
      <Brand />
      <section className="flex flex-col gap-xl rounded-card border border-rule bg-surface p-xl">
        <h1 className="font-display text-title">{LOGIN.title}</h1>
        <p className="text-ink-2">{LOGIN.lead}</p>
        {refusal && (
          <p
            role="alert"
            className="flex gap-sm rounded-field border-[1.5px] border-ink px-lg py-2.5 text-ink"
          >
            <span aria-hidden="true">⚠</span>
            <span>{LOGIN.refusals[refusal]}</span>
          </p>
        )}
        <a href="/auth/google" className={buttonVariants()}>
          {LOGIN.google}
        </a>
      </section>
    </main>
  )
}
