import { HOME } from './home.copy'
import { Marquee } from './marquee'
import { Button, buttonVariants } from './shadcn/button'

/** The home page, for the Dono who is logged in. The Sessions, the Pessoas
 * and the Cartaz arrive in the tickets of map #72. Operações shows only
 * to an admin. */
export function Home({ name, admin }: { name: string; admin: boolean }) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <form method="post" action="/auth/logout">
          <Button type="submit" variant="quiet">
            {HOME.logout}
          </Button>
        </form>
      </header>
      <h1 className="text-title">{HOME.greeting(name)}</h1>
      <p className="text-ink-2">{HOME.soon}</p>
      <nav aria-label={HOME.nav} className="flex flex-wrap gap-sm">
        <a href="/sessoes" className={buttonVariants({ variant: 'quiet' })}>
          {HOME.sessions}
        </a>
        <a href="/pessoas" className={buttonVariants({ variant: 'quiet' })}>
          {HOME.people}
        </a>
        <a href="/importar" className={buttonVariants({ variant: 'quiet' })}>
          {HOME.imports}
        </a>
        <a href="/exportar" className={buttonVariants({ variant: 'quiet' })}>
          {HOME.export}
        </a>
        <a href="/feedback" className={buttonVariants({ variant: 'quiet' })}>
          {HOME.feedback}
        </a>
        {admin && (
          <a href="/operacoes" className={buttonVariants({ variant: 'quiet' })}>
            {HOME.operations}
          </a>
        )}
      </nav>
    </main>
  )
}
