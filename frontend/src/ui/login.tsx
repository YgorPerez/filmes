import type { LoginRefusal } from '#/content/login-refusal'
import { LOGIN } from './login.copy'
import { Marquee } from './marquee'
import { buttonVariants } from './shadcn/button'

/** `/entrar`: the only page without a Dono. The button is a link, since
 * `/auth/google` answers a GET with the redirect to Google. */
export function Login({ refusal }: { refusal?: LoginRefusal }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-xl px-lg py-xl">
      <Marquee words={['filmes']} />
      <section className="flex flex-col gap-md rounded-card border border-rule bg-surface p-md">
        <h1 className="text-title">{LOGIN.title}</h1>
        <p className="text-ink-2">{LOGIN.lead}</p>
        {refusal && (
          <p
            role="alert"
            className="flex gap-sm rounded-field border border-marquee-red-text px-3 py-2.5 text-marquee-red-text"
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
