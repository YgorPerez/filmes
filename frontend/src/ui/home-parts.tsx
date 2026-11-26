import { useState } from 'react'
import { importsPath, RATINGS_PATH } from '#/content/paths'
import { feedbackPath, sessionPath } from '#/content/session-paths'
import type {
  LatestSession,
  SetupStepView,
  SetupView,
} from '#/platform/setup-guide'
import { HOME } from './home.copy'
import { useFetchForm } from './kit/fetch-form'
import { Icon } from './kit/icon'
import { ShelfLabel } from './kit/shelf-label'
import { PriceSticker } from './kit/sticker'
import { buttonVariants } from './shadcn/button'

// The home's parts as the Locadora de bairro draws them (DESIGN.md, Home):
// the counter where the Dono asks for a film, the latest Sessão's stub and
// the setup guide as one list of three steps. "Pedir filme" is the screen's
// one orange button, so every step's action is an option. The guide is
// never in the way of asking for a film.

type StepState = keyof typeof HOME.guide.state

/** Done wins over skipped: a step she skipped and did anyway is done. */
const stateOf = (step: SetupStepView): StepState =>
  step.done ? 'done' : step.skipped ? 'skipped' : 'pending'

/** A step is pending: the home shows the guide. Skipped does not count. */
export const isGuiding = (setup: SetupView) =>
  setup.steps.some((s) => stateOf(s) === 'pending')

// --- the counter ---------------------------------------------------------------

/** The counter on the case's black: the question, the blank shelf label
 * with what the request asks (who, how long, what the night calls for)
 * and the big orange "Pedir filme". */
export function Ask() {
  const { ask } = HOME
  return (
    <section
      aria-labelledby="pedir"
      className="flex flex-col gap-xl rounded-panel bg-case px-xl pt-2xl pb-xl text-case-ink"
    >
      <h1 id="pedir" className="font-display text-counter-title">
        {ask.title}
      </h1>
      <ShelfLabel items={ask.blanks} label={ask.blanksLabel} />
      <p className="text-meta text-case-ink-2">{ask.lead}</p>
      <a href="/sessoes/nova" className={buttonVariants({ variant: 'big' })}>
        <Icon name="plus" className="size-6" />
        {HOME.request}
      </a>
    </section>
  )
}

// --- the latest Sessão -----------------------------------------------------------

/** Who was there, the Dono first and as "Você". */
const attendeesOf = (s: LatestSession, person: string) => {
  const others = s.attendees.filter((a) => a.person !== person)
  const names = others.map((a) => a.name)
  return others.length < s.attendees.length
    ? [HOME.latest.you, ...names]
    : names
}

/** The latest Sessão as a rental stub: its header, over a dashed rule,
 * leads to the Sessão; then its films, a tape's spine and number each, and,
 * while its Feedback is open, the box to give it back. */
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
        href={sessionPath(s.id)}
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
        <ol
          aria-label={latest.films}
          className="grid gap-xs min-[560px]:grid-cols-2"
        >
          {s.recommendation.map((film, i) => (
            <li
              key={film.id}
              className="flex min-h-[38px] items-center gap-md overflow-hidden rounded-rail bg-surface-2 pr-md"
            >
              <span aria-hidden="true" className="w-2 self-stretch bg-case" />
              <PriceSticker compact>{i + 1}</PriceSticker>
              <span className="truncate font-display text-[15px] font-bold">
                {film.title}
              </span>
            </li>
          ))}
        </ol>
      )}
      {s.open ? (
        <div className="flex flex-col items-start gap-md rounded-field bg-card-stock p-lg text-card-stock-ink">
          <p className="font-hand text-[19px] leading-tight">{latest.open}</p>
          <p className="text-evidence">{latest.openText}</p>
          <a
            href={feedbackPath(s.id)}
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

// --- the guide -------------------------------------------------------------------

/** The three steps as three segments: violet for a done one, the stamp's
 * colour; a skipped one only outlined. The count says it in words. */
function Progress({ setup }: { setup: SetupView }) {
  const done = setup.steps.filter((s) => stateOf(s) === 'done').length
  const total = setup.steps.length
  return (
    <div className="flex items-center gap-md">
      <div
        role="progressbar"
        aria-label={HOME.guide.progressLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={HOME.guide.progress(done, total)}
        className="flex flex-1 gap-2xs"
      >
        {setup.steps.map((step) => {
          const state = stateOf(step)
          return (
            <span
              key={step.step}
              className={`h-1.5 flex-1 rounded-pill ${
                state === 'done'
                  ? 'bg-stamp'
                  : state === 'skipped'
                    ? 'border border-dashed border-ink-2'
                    : 'bg-surface-2'
              }`}
            />
          )
        })}
      </div>
      <span
        aria-hidden="true"
        className="font-display text-[13px] font-bold text-ink-2 tabular-nums"
      >
        {HOME.guide.progress(done, total)}
      </span>
    </div>
  )
}

/** The step's mark: its number in a ring while pending, a violet check
 * when done, its number in a dashed ring when skipped. */
function Mark({ state, n }: { state: StepState; n: number }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-7 shrink-0 place-items-center rounded-round font-display text-[14px] leading-none font-extrabold ${
        state === 'done'
          ? 'border-2 border-stamp text-stamp'
          : state === 'skipped'
            ? 'border-[1.5px] border-dashed border-ink-2 text-ink-2'
            : 'border-[1.5px] border-ink text-ink'
      }`}
    >
      {state === 'done' ? <Icon name="check" className="size-4" /> : n}
    </span>
  )
}

function Skip({ step }: { step: SetupStepView['step'] }) {
  const { guide } = HOME
  const { onSubmit, busy } = useFetchForm()
  const skipping = busy !== null
  return (
    <form method="post" action="/inicio/pular" onSubmit={onSubmit}>
      <input type="hidden" name="passo" value={step} />
      <button
        type="submit"
        aria-label={
          skipping ? undefined : guide.skipLabel(guide.steps[step].title)
        }
        disabled={skipping}
        className={buttonVariants({ variant: 'link', className: 'px-sm' })}
      >
        {skipping ? guide.skipping : guide.skip}
      </button>
    </form>
  )
}

/** Puts the address on the clipboard; when the browser refuses, says how
 * to copy it by hand. Meu gosto's connector section has it too. */
export function CopyAddress({ url, label }: { url: string; label: string }) {
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
        className={buttonVariants({ variant: 'option', className: 'shrink-0' })}
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

/** The connector's address on the case's black, then, until the Claude
 * app has connected (`done`), how to add it in Claude and the clerk's note
 * that the step marks itself. Meu gosto shows it too. */
export function ConnectorBody({
  url,
  done = false,
}: {
  url: string
  done?: boolean
}) {
  return (
    <>
      <code className="block rounded-field bg-case px-lg py-md font-mono text-url break-all text-case-ink">
        {url}
      </code>
      {!done && <ConnectorHow />}
    </>
  )
}

function ConnectorHow() {
  const { guide } = HOME
  return (
    <>
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
            i < ratings ? 'bg-stamp' : 'border-[1.5px] border-rule'
          }`}
        />
      ))}
      <span className="ml-xs font-display text-[13px] font-bold text-ink-2 tabular-nums">
        {HOME.guide.counter(ratings)}
      </span>
    </div>
  )
}

const stepHref = (step: SetupStepView['step'], person: string) =>
  step === 'taste'
    ? RATINGS_PATH
    : step === 'import'
      ? importsPath(person, true)
      : null

/** Where the step gets done: a link for Meu gosto and Importar; the
 * connector's is copying its address, since it marks itself. */
function StepAction({
  step,
  person,
  mcpUrl,
}: {
  step: SetupStepView['step']
  person: string
  mcpUrl: string | null
}) {
  const { guide } = HOME
  if (step === 'connector')
    return mcpUrl ? (
      <CopyAddress url={mcpUrl} label={guide.copyAddress} />
    ) : null
  const href = stepHref(step, person)
  const action = guide.steps[step].action
  return href && action ? (
    <a href={href} className={buttonVariants({ variant: 'option' })}>
      {action}
    </a>
  ) : null
}

type StepProps = {
  step: SetupStepView
  n: number
  person: string
  mcpUrl: string | null
  ratings: number
  /** The first pending step: it says what it asks and shows its content. */
  first: boolean
}

/** What the step asks and its own content: the counter of Meu gosto, the
 * connector's address. */
function StepBody({
  step,
  mcpUrl,
  ratings,
}: Pick<StepProps, 'step' | 'mcpUrl' | 'ratings'>) {
  return (
    <>
      <p className="text-[14.5px] text-pretty text-ink-2">
        {HOME.guide.steps[step.step].text}
      </p>
      {step.step === 'taste' && <Counter ratings={ratings} />}
      {step.step === 'connector' && mcpUrl && <ConnectorBody url={mcpUrl} />}
    </>
  )
}

/** One step of the list: its mark, its title with its state, and, by
 * state, what to do (pending), what it holds (done) or how to resume it
 * (skipped). */
function Step({ step, n, person, mcpUrl, ratings, first }: StepProps) {
  const { guide } = HOME
  const state = stateOf(step)
  const title = guide.steps[step.step].title
  return (
    <li className="flex gap-md py-lg first:pt-0 last:pb-0 [&+li]:border-t [&+li]:border-dashed [&+li]:border-rule">
      <Mark state={state} n={n} />
      <div className="flex min-w-0 flex-1 flex-col gap-sm">
        <h3 className="flex min-h-7 flex-wrap items-center gap-x-sm font-display text-[15.5px] leading-tight font-bold">
          {title}
          {state !== 'pending' && (
            <span className="font-body text-meta font-normal text-ink-2">
              {state === 'done' && step.step === 'taste'
                ? guide.doneRatings(ratings)
                : guide.state[state]}
            </span>
          )}
          {state === 'pending' && (
            <span className="sr-only">{guide.state.pending}</span>
          )}
        </h3>
        {state === 'pending' && (
          <>
            {first && (
              <StepBody step={step} mcpUrl={mcpUrl} ratings={ratings} />
            )}
            <div className="flex flex-wrap items-center gap-xs">
              <StepAction step={step.step} person={person} mcpUrl={mcpUrl} />
              <Skip step={step.step} />
            </div>
          </>
        )}
        {state === 'skipped' && (
          <details className="group">
            <summary className="inline-flex min-h-touch cursor-pointer list-none items-center font-body text-[14px] text-ink-2 underline underline-offset-3 group-open:hidden [&::-webkit-details-marker]:hidden">
              {guide.resume}
            </summary>
            <div className="flex flex-col items-start gap-sm">
              <StepBody step={step} mcpUrl={mcpUrl} ratings={ratings} />
              <StepAction step={step.step} person={person} mcpUrl={mcpUrl} />
            </div>
          </details>
        )}
      </div>
    </li>
  )
}

/** The setup guide while a step is pending: its progress, then the three
 * steps in order, done ones included, so she sees where she stands. */
export function Guide({
  setup,
  person,
  mcpUrl,
}: {
  setup: SetupView
  person: string
  mcpUrl: string | null
}) {
  const first = setup.steps.find((s) => stateOf(s) === 'pending')
  return (
    <section
      aria-labelledby="guia"
      className="flex flex-col gap-lg rounded-card border border-rule bg-surface p-xl"
    >
      <div className="flex flex-col gap-sm">
        <h2 id="guia" className="font-display text-step-title">
          {HOME.guide.title}
        </h2>
        <Progress setup={setup} />
      </div>
      <StepList setup={setup} person={person} mcpUrl={mcpUrl} first={first} />
    </section>
  )
}

/** A step she skipped and has not done: Meu gosto resumes it from here
 * once the home has no guide. */
export const isSkipped = (step: SetupStepView) => stateOf(step) === 'skipped'

/** The guide's steps, numbered in order: all of them, or, for Meu gosto,
 * only the skipped ones (`skippedOnly`), each with its "Retomar". */
export function StepList({
  setup,
  person,
  mcpUrl,
  first,
  skippedOnly = false,
}: {
  setup: SetupView
  person: string
  mcpUrl: string | null
  first?: SetupStepView
  skippedOnly?: boolean
}) {
  const steps = skippedOnly ? setup.steps.filter(isSkipped) : setup.steps
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => (
        <Step
          key={step.step}
          step={step}
          n={i + 1}
          person={person}
          mcpUrl={mcpUrl}
          ratings={setup.ratings}
          first={step === first}
        />
      ))}
    </ol>
  )
}
