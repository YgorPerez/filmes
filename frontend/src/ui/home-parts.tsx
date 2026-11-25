import { useState, type ReactNode } from 'react'
import type {
  LatestSession,
  SetupStepView,
  SetupView,
} from '#/platform/setup-guide'
import { HOME } from './home.copy'
import { Icon } from './kit/icon'
import { TapeCase } from './kit/tape-case'
import { buttonVariants } from './shadcn/button'

// The home's parts as the Locadora de bairro draws them (DESIGN.md, Home: o
// guia como carteirinha de sócio): the Guia de início (the membership card
// with a stamp per step, then the steps not done, the first pending one
// open; a skipped step stays closed, to resume), "pedir filme" in its two
// looks, and the latest Sessão's stub. The guide is never in the way of
// asking for a film.

type StepState = keyof typeof HOME.card.state

/** Done wins over skipped: a step she skipped and did anyway is done. */
const stateOf = (step: SetupStepView): StepState =>
  step.done ? 'done' : step.skipped ? 'skipped' : 'pending'

const pendingCount = (setup: SetupView) =>
  setup.steps.filter((s) => stateOf(s) === 'pending').length

/** A step is pending: the home shows the guide. */
export const isGuiding = (setup: SetupView) => pendingCount(setup) > 0

const CARD = 'rounded-panel bg-card-stock text-card-stock-ink'

/** A step's square on the card: its number while pending, the violet "ok"
 * stamp when done (with her Notas on Meu gosto), "pulei" when skipped. */
function Stamp({
  step,
  n,
  ratings,
}: {
  step: SetupStepView
  n: number
  ratings: number
}) {
  const state = stateOf(step)
  const short = HOME.card.short[step.step]
  return (
    <li
      aria-label={`${short}: ${HOME.card.state[state]}`}
      className="relative grid min-h-[92px] place-items-center rounded-case border-[1.5px] border-dashed border-card-stock-ink px-2xs pt-xs pb-[22px] text-center"
    >
      {state === 'done' ? (
        <span className="grid size-[58px] -rotate-12 place-content-center rounded-round border-[2.5px] border-stamp font-display text-[15px] leading-none font-extrabold tracking-[0.04em] text-stamp uppercase">
          {HOME.card.ok}
          {step.step === 'taste' && (
            <span className="block text-[11px] font-bold tracking-normal normal-case">
              {HOME.card.ratings(ratings)}
            </span>
          )}
        </span>
      ) : state === 'skipped' ? (
        <span className="-rotate-6 font-hand text-[17px] leading-none opacity-75">
          {HOME.card.skipped}
        </span>
      ) : (
        <span className="font-display text-[26px] leading-none font-extrabold opacity-35">
          {n}
        </span>
      )}
      <small className="absolute inset-x-0 bottom-xs font-display text-[11.5px] leading-tight font-bold">
        {short}
      </small>
    </li>
  )
}

/** The membership card while a step is pending: her first name, how many
 * stamps are left, and a square per step. No grammatical gender, no member
 * number. */
export function MemberCard({
  name,
  setup,
}: {
  name: string
  setup: SetupView
}) {
  const left = pendingCount(setup)
  return (
    <section
      aria-label={HOME.card.region(left)}
      className={`${CARD} flex flex-col gap-lg px-xl pt-xl pb-2xl`}
    >
      <p className="flex items-baseline justify-between font-display text-[12px] leading-none font-extrabold tracking-[0.08em] uppercase">
        <span>{HOME.card.label}</span>
        <span>{HOME.card.brand}</span>
      </p>
      <div>
        <p className="mt-[2px] font-hand text-hand-name">{name}</p>
        <p className="font-display text-[12.5px] font-medium opacity-80">
          {HOME.card.left(left)}
        </p>
      </div>
      <ol className="grid grid-cols-3 gap-sm">
        {setup.steps.map((step, i) => (
          <Stamp
            key={step.step}
            step={step}
            n={i + 1}
            ratings={setup.ratings}
          />
        ))}
      </ol>
    </section>
  )
}

/** The card once nothing is pending: her name and a seal per step, a
 * violet ring with a full core when done, a dashed ring when skipped. With
 * a step skipped, tapping it opens the skipped steps to resume. */
export function MemberStrip({
  name,
  setup,
  person,
  mcpUrl,
}: {
  name: string
  setup: SetupView
  person: string
  mcpUrl: string | null
}) {
  const strip = (
    <>
      <p className="font-hand text-[19px] leading-none">{name}</p>
      <ul aria-label={HOME.card.stamps} className="ml-auto flex gap-2xs">
        {setup.steps.map((step) => {
          const state = stateOf(step)
          return (
            <li
              key={step.step}
              aria-label={`${HOME.card.short[step.step]}: ${HOME.card.state[state]}`}
              className={`grid size-[22px] place-items-center rounded-round border-2 ${
                state === 'done'
                  ? 'border-stamp'
                  : 'border-dashed border-card-stock-ink/60'
              }`}
            >
              {state === 'done' && (
                <span className="size-2 rounded-round bg-stamp" />
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
  const box = 'rounded-card bg-card-stock text-card-stock-ink'
  const row = 'flex min-h-touch items-center gap-md px-lg py-md'
  if (!setup.steps.some((s) => stateOf(s) === 'skipped'))
    return <div className={`${box} ${row}`}>{strip}</div>
  return (
    <details className={box}>
      <summary
        className={`${row} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        {strip}
      </summary>
      <div className="px-sm pb-sm">
        <Guide
          setup={setup}
          person={person}
          mcpUrl={mcpUrl}
          label={HOME.card.resume}
        />
      </div>
    </details>
  )
}

/** The step's number on the orange price sticker. */
function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-7 shrink-0 place-items-center rounded-round bg-sticker-orange font-display text-[15px] leading-none font-extrabold text-on-sticker"
    >
      {n}
    </span>
  )
}

function Skip({ step }: { step: SetupStepView['step'] }) {
  const title = HOME.guide.steps[step].title
  return (
    <form method="post" action="/inicio/pular">
      <input type="hidden" name="passo" value={step} />
      <button
        type="submit"
        aria-label={HOME.guide.skipLabel(title)}
        className={buttonVariants({ variant: 'link', className: 'px-sm' })}
      >
        {HOME.guide.skip}
      </button>
    </form>
  )
}

/** Puts the address on the clipboard; when the browser refuses, says how
 * to copy it by hand. `sticker` is the open step's orange button. */
function CopyAddress({
  url,
  label,
  look,
}: {
  url: string
  label: string
  look: 'sticker' | 'option'
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('failed')
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={copy}
        className={
          look === 'sticker'
            ? 'inline-flex min-h-touch shrink-0 cursor-pointer items-center gap-xs rounded-rail bg-sticker-orange px-md font-display text-[12px] font-extrabold whitespace-nowrap text-on-sticker uppercase'
            : buttonVariants({ variant: 'option', className: 'shrink-0' })
        }
      >
        <Icon name="copy" className="size-4" />
        {state === 'copied' ? HOME.guide.copied : label}
      </button>
      {state === 'failed' && (
        <span role="status" className="basis-full text-meta">
          {HOME.guide.copyFailed}
        </span>
      )}
    </>
  )
}

/** The connector's address on the case's black, copy inside, then how to
 * add it in Claude and the clerk's note that the step marks itself. */
function ConnectorBody({
  url,
  look,
}: {
  url: string
  look: 'sticker' | 'option'
}) {
  const { guide } = HOME
  return (
    <>
      <div className="flex min-h-[52px] flex-wrap items-center gap-sm rounded-field bg-case py-2xs pr-2xs pl-lg text-case-ink">
        <code className="min-w-0 flex-1 font-mono text-url break-all">
          {url}
        </code>
        <CopyAddress url={url} label={guide.copy} look={look} />
      </div>
      <ol className="flex list-decimal flex-col gap-2xs pl-3xl text-evidence">
        {guide.how.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <p className="font-hand text-[15px] leading-snug text-stamp">
        {guide.auto}
      </p>
    </>
  )
}

const stepHref = (step: SetupStepView['step'], person: string) =>
  step === 'taste'
    ? '/notas'
    : step === 'import'
      ? `/importar/${encodeURIComponent(person)}`
      : null

/** Her Notas toward the 10 of Meu gosto: a dot each. */
function Counter({ ratings }: { ratings: number }) {
  return (
    <div
      role="img"
      aria-label={HOME.guide.counterLabel(ratings)}
      className="flex items-center gap-[5px]"
    >
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`size-3.5 rounded-round ${
            i < ratings ? 'bg-sticker-orange' : 'border-[1.5px] border-rule'
          }`}
        />
      ))}
      <span className="ml-xs font-display text-[13px] font-bold text-ink-2">
        {HOME.guide.counter(ratings)}
      </span>
    </div>
  )
}

type StepProps = {
  step: SetupStepView
  n: number
  person: string
  mcpUrl: string | null
  ratings: number
}

/** What the step asks, then its own content: the counter of Meu gosto, the
 * connector's address. `main` is the open step's, whose copy button is the
 * screen's one orange button. */
function StepBody({
  step,
  mcpUrl,
  ratings,
  main,
}: StepProps & { main: boolean }) {
  return (
    <>
      <p className="text-[14.5px] text-pretty text-ink-2">
        {HOME.guide.steps[step.step].text}
      </p>
      {step.step === 'taste' && <Counter ratings={ratings} />}
      {step.step === 'connector' && mcpUrl && (
        <ConnectorBody url={mcpUrl} look={main ? 'sticker' : 'option'} />
      )}
    </>
  )
}

/** Where the step is done, as a link: the orange button on the open step,
 * an option elsewhere. The connector has none: it marks itself. */
function StepAction({
  step,
  person,
  main,
}: {
  step: SetupStepView
  person: string
  main: boolean
}) {
  const copy = HOME.guide.steps[step.step]
  const href = stepHref(step.step, person)
  if (!href || !copy.action) return null
  return (
    <a
      href={href}
      className={buttonVariants({ variant: main ? 'primary' : 'option' })}
    >
      {copy.action}
    </a>
  )
}

function Title({
  n,
  step,
  size,
}: {
  n: number
  step: SetupStepView
  size: 'open' | 'closed'
}) {
  return (
    <h3
      className={`flex items-center gap-md font-display ${
        size === 'open'
          ? 'text-step-title'
          : 'text-[15.5px] leading-tight font-bold'
      }`}
    >
      <StepNumber n={n} />
      {HOME.guide.steps[step.step].title}
    </h3>
  )
}

const ROW = 'rounded-card border border-rule bg-surface'

function OpenStep(props: StepProps) {
  return (
    <li className={`${ROW} flex flex-col gap-sm p-xl`}>
      <Title n={props.n} step={props.step} size="open" />
      <StepBody {...props} main />
      <div className="flex flex-wrap items-center gap-sm">
        <StepAction step={props.step} person={props.person} main />
        <Skip step={props.step.step} />
      </div>
    </li>
  )
}

/** A pending step after the open one: its action as an option, and
 * "pular". */
function ClosedStep({ step, n, person, mcpUrl }: StepProps) {
  const action: ReactNode =
    step.step === 'connector' && mcpUrl ? (
      <CopyAddress url={mcpUrl} label={HOME.guide.copyAddress} look="option" />
    ) : (
      <StepAction step={step} person={person} main={false} />
    )
  return (
    <li
      className={`${ROW} flex flex-wrap items-center justify-between gap-x-sm gap-y-2xs py-xs pr-xs pl-xl`}
    >
      <Title n={n} step={step} size="closed" />
      <div className="ml-auto flex items-center">
        {action}
        <Skip step={step.step} />
      </div>
    </li>
  )
}

/** A skipped step: closed, with "Retomar" opening what it asks. */
function SkippedStep(props: StepProps) {
  return (
    <li className={ROW}>
      <details className="group">
        <summary className="flex min-h-touch cursor-pointer list-none flex-wrap items-center justify-between gap-sm py-xs pr-xl pl-xl [&::-webkit-details-marker]:hidden">
          <Title n={props.n} step={props.step} size="closed" />
          <span className="font-body text-[14px] text-ink-2 underline underline-offset-3 group-open:hidden">
            {HOME.guide.resume}
          </span>
        </summary>
        <div className="flex flex-col items-start gap-sm px-xl pb-xl">
          <StepBody {...props} main={false} />
          <StepAction step={props.step} person={props.person} main={false} />
        </div>
      </details>
    </li>
  )
}

/** The steps not done, in order: the first pending open, the other pending
 * ones closed, the skipped ones closed to resume. */
export function Guide({
  setup,
  person,
  mcpUrl,
  label = HOME.guide.title,
}: {
  setup: SetupView
  person: string
  mcpUrl: string | null
  /** The list's name: the home's guide, or the skipped steps under the
   * compact card. */
  label?: string
}) {
  const open = setup.steps.find((s) => stateOf(s) === 'pending')
  return (
    <ol aria-label={label} className="flex flex-col gap-md">
      {setup.steps.map((step, i) => {
        const props = { step, n: i + 1, person, mcpUrl, ratings: setup.ratings }
        const state = stateOf(step)
        if (state === 'done') return null
        if (state === 'skipped')
          return <SkippedStep key={step.step} {...props} />
        return step === open ? (
          <OpenStep key={step.step} {...props} />
        ) : (
          <ClosedStep key={step.step} {...props} />
        )
      })}
    </ol>
  )
}

/** "Pedir filme" under the guide: an option, since the open step holds the
 * screen's orange button. */
export function AskEarly() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-sm">
      <p className="text-[14px] text-ink-2">{HOME.guide.early}</p>
      <a href="/sessoes/nova" className={buttonVariants({ variant: 'option' })}>
        <Icon name="plus" className="size-4" />
        {HOME.request}
      </a>
    </div>
  )
}

/** The big "Pedir filme": the screen's orange button once set up. */
export function AskBig() {
  return (
    <a href="/sessoes/nova" className={buttonVariants({ variant: 'big' })}>
      <Icon name="plus" className="size-6" />
      {HOME.request}
    </a>
  )
}

const sessionHref = (id: string) => `/sessoes/${encodeURIComponent(id)}`
const feedbackHref = (id: string) => `/feedback/${encodeURIComponent(id)}`

/** Who was there, the Dono first and as "Você". */
const attendeesOf = (s: LatestSession, person: string) => {
  const others = s.attendees.filter((a) => a.person !== person)
  const names = others.map((a) => a.name)
  return others.length < s.attendees.length
    ? [HOME.latest.you, ...names]
    : names
}

/** The latest Sessão as a rental stub: its header, over a dashed rule,
 * leads to the Sessão; then its films in small tapes and, while its
 * Feedback is open, the box to give it back. */
export function Latest({
  session: s,
  person,
}: {
  session: LatestSession
  person: string
}) {
  const { latest } = HOME
  return (
    <section
      aria-labelledby="ultima-sessao"
      className="flex flex-col gap-lg rounded-card border border-rule bg-surface px-lg pt-xl pb-lg"
    >
      <a
        href={sessionHref(s.id)}
        className="flex flex-wrap items-baseline justify-between gap-x-sm gap-y-2xs border-b border-dashed border-rule pb-md text-ink no-underline"
      >
        <h2
          id="ultima-sessao"
          className="font-display text-[13px] leading-none font-extrabold tracking-[0.08em] text-ink-2 uppercase"
        >
          {latest.title}
        </h2>
        <span className="font-hand text-[16px] leading-tight">
          {latest.when(s.date, attendeesOf(s, person))}
        </span>
      </a>
      {s.request && <p className="text-evidence text-ink-2">{s.request}</p>}
      {s.recommendation.length > 0 && (
        <ol aria-label={latest.films} className="grid grid-cols-4 gap-sm">
          {s.recommendation.map((film) => (
            <li key={film.id}>
              <TapeCase cover={film.title} className="w-full" />
            </li>
          ))}
        </ol>
      )}
      {s.open ? (
        <div className="flex flex-col items-start gap-md rounded-field bg-card-stock p-lg text-card-stock-ink">
          <p className="font-hand text-[19px] leading-tight">{latest.open}</p>
          <p className="text-evidence">{latest.openText}</p>
          <a
            href={feedbackHref(s.id)}
            aria-label={latest.feedbackLabel(s.id)}
            className={buttonVariants({ variant: 'option' })}
          >
            {latest.feedback}
          </a>
        </div>
      ) : (
        <p className="text-meta text-ink-2">
          {s.chosen ? latest.chosen(s.chosen.title) : latest.nothing}
        </p>
      )}
    </section>
  )
}
