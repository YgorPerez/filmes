import { useEffect, useRef, useState, type ReactNode } from 'react'
import { importsPath, RATINGS_PATH } from '#/content/paths'
import { feedbackPath, sessionPath } from '#/content/session-paths'
import type { LatestSession, SetupView } from '#/platform/setup-guide'
import { HOME } from './home.copy'
import { PostForm } from './kit/post-form'
import { guideSteps, isSkipped, stateOf, type GuideStep } from './setup-steps'
import { Icon } from './kit/icon'
import { RowArrow } from './kit/row-arrow'
import { ShelfLabel } from './kit/shelf-label'
import { PriceSticker } from './kit/sticker'
import { buttonVariants } from './kit/button-variants'

// The home's parts as the Locadora de bairro draws them (DESIGN.md, Home):
// the counter where the Dono asks for a film, the latest Sessão's stub and
// the setup guide as one list of two steps. "Pedir filme" is the screen's
// one orange button, so every step's action is an option. The guide is
// never in the way of asking for a film.

// --- the counter ---------------------------------------------------------------

/** The counter on the case's black: the question, the blank shelf label
 * with what the request asks (who, how long, what the night calls for)
 * and the big orange "Pedir filme". The shelf label leads to the same form,
 * for a tap there; out of the tab order, since the button is the next stop. */
export function Ask() {
  const { ask } = HOME
  return (
    <section
      aria-labelledby="pedir"
      className="flex flex-col gap-xl rounded-panel border border-case-edge bg-case px-xl pt-2xl pb-xl text-case-ink"
    >
      <h1 id="pedir" className="font-display text-counter-title">
        {ask.title}
      </h1>
      <a href={NEW_SESSION} tabIndex={-1} className="w-fit no-underline">
        <ShelfLabel items={ask.blanks} label={ask.blanksLabel} />
      </a>
      <p className="text-meta text-case-ink-2">{ask.lead}</p>
      <a href={NEW_SESSION} className={buttonVariants({ variant: 'big' })}>
        <Icon name="plus" className="size-6" />
        {HOME.request}
      </a>
    </section>
  )
}

const NEW_SESSION = '/sessoes/nova'

/** Nova Sessão filled as Sessão `id` was asked. */
const repeatPath = (id: string) =>
  `${NEW_SESSION}?${new URLSearchParams({ repetir: id })}`

/** Before the first Sessão: where it will show. */
export function NoSession() {
  return (
    <p className="rounded-card border border-dashed border-rule px-lg py-xl text-center text-evidence text-ink-2">
      {HOME.latest.none}
    </p>
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

/** The tape's cover slot, the same 30px in every row so the numbers line
 * up: the poster, or the case's black when there is none or it fails to
 * load (never the broken-image glyph). An image that failed before the
 * page hydrated is caught when it mounts. */
function TapeCover({ src }: { src: string | null }) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <span
      aria-hidden="true"
      className="h-touch w-7.5 shrink-0 overflow-hidden border-r border-case-edge bg-case"
    >
      {src !== null && failed !== src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(src)}
          ref={(img) => {
            if (img?.complete && img.naturalWidth === 0) setFailed(src)
          }}
          className="size-full object-cover"
        />
      )}
    </span>
  )
}

/** One film of the Sessão as a tape on the shelf: its cover slot, its
 * number and title, leading to its card in the Cartaz. */
function Tape({
  film,
  n,
  session,
  cover,
}: {
  film: LatestSession['recommendation'][number]
  n: number
  session: string
  cover: string | null
}) {
  return (
    <li>
      <a
        href={`${sessionPath(session)}#filme-${film.id}`}
        className="flex min-h-touch items-center gap-md overflow-hidden rounded-rail bg-surface-2 pr-md text-ink no-underline hover:bg-rule"
      >
        <TapeCover src={cover} />
        <PriceSticker compact>{n}</PriceSticker>
        <span className="min-w-0 flex-1 truncate font-display text-row-title">
          {film.title}
        </span>
        <RowArrow className="shrink-0" />
      </a>
    </li>
  )
}

/** The latest Sessão as a rental stub: its header, over a dashed rule,
 * leads to the Sessão; then its films, each a tape that leads to its card.
 * On the night it was made, the way back to the Cartaz comes first and the
 * Feedback is a link; from the next day, while the Feedback is open, the
 * card-stock box asks for it. Last, the same request again. */
export function Latest({
  session: s,
  person,
  today = null,
  covers = {},
}: {
  session: LatestSession
  person: string
  today?: string | null
  covers?: Readonly<Record<string, string | null>>
}) {
  const { latest } = HOME
  const who = attendeesOf(s, person)
  const tonight = s.open && today !== null && s.date === today
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
          className="font-display text-slip-title text-ink-2 uppercase"
        >
          {latest.title}
        </h2>
        <span className="font-hand text-hand-compact leading-tight">
          {latest.when(s.date, today, who)}
        </span>
      </a>
      {s.request && <p className="text-evidence text-ink-2">{s.request}</p>}
      {s.recommendation.length > 0 && (
        <ol aria-label={latest.films} className="flex flex-col gap-xs">
          {s.recommendation.map((film, i) => (
            <Tape
              key={film.id}
              film={film}
              n={i + 1}
              session={s.id}
              cover={covers[film.id] ?? null}
            />
          ))}
        </ol>
      )}
      {tonight ? (
        <div className="flex flex-wrap items-center gap-x-md gap-y-xs">
          <a
            href={sessionPath(s.id)}
            className={buttonVariants({ variant: 'option' })}
          >
            {latest.billboard}
          </a>
          <a
            href={feedbackPath(s.id)}
            className={buttonVariants({ variant: 'link' })}
          >
            {latest.feedback}
          </a>
        </div>
      ) : s.open ? (
        <div className="flex flex-col items-start gap-md rounded-field bg-card-stock p-lg text-card-stock-ink">
          <p className="font-hand text-hand-large leading-tight">
            {latest.open}
          </p>
          <p className="text-evidence">{latest.openText}</p>
          <a
            href={feedbackPath(s.id)}
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
      <a
        href={repeatPath(s.id)}
        className="flex min-h-touch items-center gap-sm border-t border-dashed border-rule pt-md text-link text-ink no-underline"
      >
        <span className="min-w-0 flex-1">
          <span className="font-display text-meta-strong">{latest.again}</span>{' '}
          <span className="text-ink-2">
            {latest.againWhat(who, s.constraints)}
          </span>
        </span>
        <RowArrow className="shrink-0" />
      </a>
    </section>
  )
}

// --- the guide -------------------------------------------------------------------

/** The step's mark: its number in a ring while pending, a violet check
 * when done, its number in a dashed ring when skipped. */
type StepState = keyof typeof HOME.guide.state

function Mark({ state, n }: { state: StepState; n: number }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-7 shrink-0 place-items-center rounded-round font-display text-price-compact ${
        state === 'done'
          ? 'border-2 border-stamp text-stamp'
          : state === 'skipped'
            ? 'border-(length:--border-width-stroke) border-dashed border-ink-2 text-ink-2'
            : 'border-(length:--border-width-stroke) border-ink text-ink'
      }`}
    >
      {state === 'done' ? <Icon name="check" className="size-4" /> : n}
    </span>
  )
}

function Skip({ step }: { step: GuideStep['step'] }) {
  const { guide } = HOME
  return (
    <PostForm action="/inicio/pular">
      {(skipping) => (
        <>
          <input type="hidden" name="passo" value={step} />
          <button
            type="submit"
            aria-label={
              skipping ? undefined : guide.skipLabel(guide.steps[step].name)
            }
            disabled={skipping}
            className={buttonVariants({ variant: 'link', className: 'px-sm' })}
          >
            {skipping ? guide.skipping : guide.skip}
          </button>
        </>
      )}
    </PostForm>
  )
}

/** How long "Copiado" stays on the button. */
const COPIED_FOR_MS = 3000

/** Puts the address on the clipboard and says where to paste it; when the
 * browser refuses, says how to copy it by hand. Meu gosto's connector
 * section has it too. */
export function CopyAddress({ url, label }: { url: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  useEffect(() => {
    if (state !== 'copied') return
    const back = setTimeout(() => setState('idle'), COPIED_FOR_MS)
    return () => clearTimeout(back)
  }, [state])
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
        <Icon name={state === 'copied' ? 'check' : 'copy'} className="size-4" />
        {state === 'copied' ? HOME.guide.copied : label}
      </button>
      <span role="status" className="basis-full text-meta empty:hidden">
        {state === 'copied'
          ? HOME.guide.pasteIt
          : state === 'failed'
            ? HOME.guide.copyFailed
            : ''}
      </span>
    </>
  )
}

/** The connector's address on the case's black, then, until the Claude
 * app has connected (`done`), how to add it in Claude and the note that
 * the step marks itself. Meu gosto shows it too. */
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
          <li key={line} className="text-pretty">
            {line}
          </li>
        ))}
      </ol>
      <p className="text-meta text-pretty text-ink-2">{guide.auto}</p>
    </>
  )
}

/** Her Notas toward the 10 of Meu gosto: a dot each; at zero, how long it
 * takes instead of ten empty dots. */
function Counter({ ratings }: { ratings: number }) {
  if (ratings === 0)
    return <p className="text-meta text-ink-2">{HOME.guide.quick}</p>
  return (
    <div
      role="img"
      aria-label={HOME.guide.counterLabel(ratings)}
      className="flex items-center gap-1.25"
    >
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`size-3.5 rounded-round ${
            i < ratings
              ? 'bg-stamp'
              : 'border-(length:--border-width-stroke) border-rule-strong'
          }`}
        />
      ))}
      <span className="ml-xs font-display text-meta-strong text-ink-2 tabular-nums">
        {HOME.guide.counter(ratings)}
      </span>
    </div>
  )
}

/** Where Meu gosto gets done: her Notas, or an import of her history. */
function TasteActions({ person }: { person: string }) {
  const { taste } = HOME.guide.steps
  return (
    <>
      <a href={RATINGS_PATH} className={buttonVariants({ variant: 'option' })}>
        {taste.rate}
      </a>
      <a
        href={importsPath(person, true)}
        className={buttonVariants({ variant: 'option' })}
      >
        {taste.import}
      </a>
    </>
  )
}

type StepProps = {
  step: GuideStep
  n: number
  person: string
  mcpUrl: string | null
  ratings: number
  /** The first pending step: it shows its whole content. */
  first: boolean
  /** She has a Sessão: the connector stays folded even when first. */
  fold?: boolean
}

/** What the step holds beyond its line: the counter of Meu gosto, the
 * connector's address and how to add it, with its copy button. */
function StepContent({
  step,
  person,
  mcpUrl,
  ratings,
  skip,
}: Pick<StepProps, 'step' | 'person' | 'mcpUrl' | 'ratings'> & {
  skip: boolean
}) {
  return step.step === 'taste' ? (
    <>
      <Counter ratings={ratings} />
      <div className="flex flex-wrap items-center gap-xs">
        <TasteActions person={person} />
        {skip && <Skip step="taste" />}
      </div>
    </>
  ) : (
    <>
      {mcpUrl && <ConnectorBody url={mcpUrl} />}
      <div className="flex flex-wrap items-center gap-xs">
        {mcpUrl && <CopyAddress url={mcpUrl} label={HOME.guide.copyAddress} />}
        {skip && <Skip step="connector" />}
      </div>
    </>
  )
}

/** A pending step: its line, always, then its content. The connector
 * keeps its content folded under "Ver como conectar" behind another pending
 * step, and once she has a Sessão (`fold`), so the guide stays short for a
 * Dono who does not use Claude, and the address is never copied blind. */
function Pending({ step, n, person, mcpUrl, ratings, first, fold }: StepProps) {
  const { guide } = HOME
  const copy = guide.steps[step.step]
  return (
    <StepFrame state="pending" n={n}>
      <h3 className="flex min-h-7 items-center font-display text-step-title-small">
        {copy.title}
        <span className="sr-only">, {guide.state.pending}</span>
      </h3>
      <p className="text-evidence-step text-pretty text-ink-2">{copy.text}</p>
      {step.step === 'taste' || (first && !fold) ? (
        <StepContent
          step={step}
          person={person}
          mcpUrl={mcpUrl}
          ratings={ratings}
          skip
        />
      ) : (
        <FoldedConnector mcpUrl={mcpUrl} />
      )}
    </StepFrame>
  )
}

/** The connector folded: "Ver como conectar" with "Pular" beside it;
 * open, the address and how to add it, then Copiar endereço, Pular and
 * "Fechar" at the end, where the reading stops. */
function FoldedConnector({ mcpUrl }: { mcpUrl: string | null }) {
  const { guide } = HOME
  const [open, setOpen] = useState(false)
  // Focus follows the toggle: to what opened, and back to the button that
  // opens it again; not on the first render.
  const toggled = useRef(false)
  const body = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!toggled.current) return
    ;(open ? body : opener).current?.focus()
  }, [open])
  const toggle = (next: boolean) => {
    toggled.current = true
    setOpen(next)
  }
  const id = 'como-conectar'
  return open ? (
    <div
      id={id}
      ref={body}
      tabIndex={-1}
      className="flex flex-col gap-sm outline-none"
    >
      {mcpUrl && <ConnectorBody url={mcpUrl} />}
      <div className="flex flex-wrap items-center gap-xs">
        {mcpUrl && <CopyAddress url={mcpUrl} label={guide.copyAddress} />}
        <Skip step="connector" />
        <button
          type="button"
          aria-expanded="true"
          aria-controls={id}
          onClick={() => toggle(false)}
          className={buttonVariants({ variant: 'link', className: 'px-sm' })}
        >
          {guide.close}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-xs">
      <button
        type="button"
        ref={opener}
        aria-expanded="false"
        onClick={() => toggle(true)}
        className={buttonVariants({ variant: 'option' })}
      >
        {guide.howToConnect}
      </button>
      <Skip step="connector" />
    </div>
  )
}

/** A skipped step: its title with "pulado · Retomar" on one line, the
 * whole line opening it again; open, "Retomar" reads "Fechar". */
function Skipped({ step, n, person, mcpUrl, ratings }: StepProps) {
  const { guide } = HOME
  const copy = guide.steps[step.step]
  return (
    <StepFrame state="skipped" n={n}>
      <details className="group">
        <summary className="relative flex min-h-7 cursor-pointer list-none flex-wrap items-center gap-x-sm after:absolute after:inset-x-0 after:-inset-y-2 [&::-webkit-details-marker]:hidden">
          <h3 className="font-display text-step-title-small">{copy.name}</h3>
          <span className="text-meta text-ink-2">
            {guide.state.skipped} ·{' '}
            <span className="text-link underline underline-offset-3 group-open:hidden">
              {guide.resume}
            </span>
            <span className="hidden text-link underline underline-offset-3 group-open:inline">
              {guide.close}
            </span>
          </span>
        </summary>
        <div className="mt-sm flex flex-col items-start gap-sm">
          <p className="text-evidence-step text-pretty text-ink-2">
            {copy.text}
          </p>
          <StepContent
            step={step}
            person={person}
            mcpUrl={mcpUrl}
            ratings={ratings}
            skip={false}
          />
        </div>
      </details>
    </StepFrame>
  )
}

/** A done step: its name and what it holds. */
function Done({ step, n, ratings }: Pick<StepProps, 'step' | 'n' | 'ratings'>) {
  const { guide } = HOME
  return (
    <StepFrame state="done" n={n}>
      <h3 className="flex min-h-7 flex-wrap items-center gap-x-sm font-display text-step-title-small">
        {guide.steps[step.step].name}
        <span className="font-body text-meta font-normal text-ink-2">
          {step.step === 'taste'
            ? guide.doneRatings(ratings)
            : guide.state.done}
        </span>
      </h3>
    </StepFrame>
  )
}

function StepFrame({
  state,
  n,
  children,
}: {
  state: StepState
  n: number
  children: ReactNode
}) {
  return (
    <li className="flex gap-md py-lg first:pt-0 last:pb-0 [&+li]:border-t [&+li]:border-dashed [&+li]:border-rule">
      <Mark state={state} n={n} />
      <div className="flex min-w-0 flex-1 flex-col gap-sm">{children}</div>
    </li>
  )
}

function Step(props: StepProps) {
  const state = stateOf(props.step)
  return state === 'done' ? (
    <Done {...props} />
  ) : state === 'skipped' ? (
    <Skipped {...props} />
  ) : (
    <Pending {...props} />
  )
}

/** The setup guide while a step is pending: what Meu gosto buys her while
 * it is pending (none when only the connector is left), then its two steps
 * in order, done ones included, so she sees where she stands. */
export function Guide({
  setup,
  person,
  mcpUrl,
  fold = false,
}: {
  setup: SetupView
  person: string
  mcpUrl: string | null
  /** She has a Sessão: the connector stays folded. */
  fold?: boolean
}) {
  const tastePending = guideSteps(setup).some(
    (s) => s.step === 'taste' && stateOf(s) === 'pending',
  )
  return (
    <section
      aria-labelledby="guia"
      className="flex flex-col gap-lg rounded-card border border-rule bg-surface p-xl"
    >
      <div className="flex flex-col gap-xs">
        <h2 id="guia" className="font-display text-step-title">
          {HOME.guide.title}
        </h2>
        {tastePending && (
          <p className="text-evidence text-pretty text-ink-2">
            {HOME.guide.payoff}
          </p>
        )}
      </div>
      <StepList setup={setup} person={person} mcpUrl={mcpUrl} fold={fold} />
    </section>
  )
}

/** The guide's steps, numbered in order: all of them, or, for Meu gosto,
 * only the skipped ones (`skippedOnly`), each with its "Retomar". */
export function StepList({
  setup,
  person,
  mcpUrl,
  skippedOnly = false,
  fold = false,
}: {
  setup: SetupView
  person: string
  mcpUrl: string | null
  skippedOnly?: boolean
  fold?: boolean
}) {
  const all = guideSteps(setup)
  const first = all.find((s) => stateOf(s) === 'pending')
  const steps = skippedOnly ? all.filter(isSkipped) : all
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
          fold={fold}
        />
      ))}
    </ol>
  )
}
