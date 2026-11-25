import type { ReactNode } from 'react'
import type {
  HomeData,
  LatestSession,
  SetupStepView,
} from '#/platform/setup-guide'
import { HOME } from './home.copy'
import { Marquee } from './marquee'
import { Button, buttonVariants } from './shadcn/button'

/** A link that looks like a button, kept to the start of its column. */
const linkClass = (variant: 'primary' | 'quiet') =>
  buttonVariants({ variant, className: 'self-start' })

/** A card of the home: its title, then what it holds. */
function Card({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-md rounded-card border border-rule bg-surface p-md"
    >
      {children}
    </section>
  )
}

const sessionHref = (id: string) => `/sessoes/${encodeURIComponent(id)}`
const feedbackHref = (id: string) => `/feedback/${encodeURIComponent(id)}`

/** Where each step is done. Meu gosto leads to her Pessoa page until the
 * rating screen (#144) arrives. */
const stepHref = (step: SetupStepView['step'], person: string) =>
  step === 'taste'
    ? `/pessoas/${encodeURIComponent(person)}`
    : step === 'import'
      ? `/importar/${encodeURIComponent(person)}`
      : null

function StepState({ step }: { step: SetupStepView }) {
  const { guide } = HOME
  if (step.done)
    return <span className="text-meta text-ink-2">✓ {guide.done}</span>
  if (step.skipped)
    return <span className="text-meta text-ink-2">{guide.skipped}</span>
  return (
    <form method="post" action="/inicio/pular">
      <input type="hidden" name="passo" value={step.step} />
      <Button
        type="submit"
        variant="quiet"
        aria-label={guide.skipLabel(guide.steps[step.step].title)}
      >
        {guide.skip}
      </Button>
    </form>
  )
}

/** A step of the guide: what it asks, where to do it while pending, and its
 * state. */
function Step({
  step,
  person,
  mcpUrl,
}: {
  step: SetupStepView
  person: string
  mcpUrl: string | null
}) {
  const copy = HOME.guide.steps[step.step]
  const pending = !step.done && !step.skipped
  const href = stepHref(step.step, person)
  return (
    <li className="flex flex-col gap-sm border-rule py-sm not-first:border-t">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <h3 className="font-semibold">{copy.title}</h3>
        <StepState step={step} />
      </div>
      {pending && (
        <>
          <p className="text-meta text-ink-2">{copy.text}</p>
          {step.step === 'connector' && mcpUrl && (
            <p className="break-all">
              <code>{mcpUrl}</code>
            </p>
          )}
          {href && copy.action && (
            <a href={href} className={linkClass('primary')}>
              {copy.action}
            </a>
          )}
        </>
      )}
    </li>
  )
}

function Guide({
  steps,
  person,
  mcpUrl,
}: {
  steps: SetupStepView[]
  person: string
  mcpUrl: string | null
}) {
  return (
    <Card id="guia">
      <h2 id="guia" className="text-title">
        {HOME.guide.title}
      </h2>
      <p className="text-meta text-ink-2">{HOME.guide.lead}</p>
      <ol className="flex flex-col">
        {steps.map((step) => (
          <Step key={step.step} step={step} person={person} mcpUrl={mcpUrl} />
        ))}
      </ol>
    </Card>
  )
}

/** The latest Sessão she was in, and its Feedback while open. */
function Latest({ session: s }: { session: LatestSession }) {
  const { latest } = HOME
  return (
    <Card id="ultima-sessao">
      <h2 id="ultima-sessao" className="text-title">
        {latest.title}
      </h2>
      <div className="flex flex-wrap items-center gap-sm">
        <a
          href={sessionHref(s.id)}
          className="flex min-h-touch min-w-0 flex-1 basis-[240px] flex-col justify-center gap-0.5 text-ink no-underline"
        >
          <span className="font-semibold">
            {s.date} · {s.attendees.map((a) => a.name).join(', ')}
          </span>
          <span className="text-meta text-ink-2">
            {[
              s.request,
              s.open
                ? latest.open
                : s.chosen
                  ? latest.chosen(s.chosen.title)
                  : latest.nothing,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </a>
        {s.open && (
          <a
            href={feedbackHref(s.id)}
            aria-label={latest.feedbackLabel(s.id)}
            className={linkClass('quiet')}
          >
            {latest.feedback}
          </a>
        )}
      </div>
    </Card>
  )
}

/** The home page, for the Dono who is logged in: the setup guide while a
 * step is pending (#143), "pedir filme", her latest Sessão and every
 * screen. The guide never blocks: "pedir filme" is always there. Operações
 * shows only to an admin. */
export function Home({
  name,
  admin,
  home,
}: {
  name: string
  admin: boolean
  home: HomeData
}) {
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
      {home.guide && (
        <Guide steps={home.guide} person={home.person} mcpUrl={home.mcpUrl} />
      )}
      <a href="/sessoes/nova" className={linkClass('primary')}>
        {HOME.request}
      </a>
      {home.latest && <Latest session={home.latest} />}
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
