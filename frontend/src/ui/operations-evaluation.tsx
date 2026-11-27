import { useEffect, useRef, useState } from 'react'
import type {
  EvaluationJob,
  EvaluationPanel,
  EvaluationSummary,
  GridBest,
  PreviousMeasure,
} from '#/platform/operations'
import { Icon } from './kit/icon'
import { OPERATIONS } from './operations.copy'
import { ActionPost, Alert, Detail, Section } from './operations-parts'
import { CopyButton, Report } from './operations-report'

const COPY = OPERATIONS.evaluation

/** How often the page asks for the progress while a run goes on. */
const POLL_MS = 1000

/** Fewer Pessoas than this, and the measure moves a lot between runs. */
const SMALL_SAMPLE = 10

/** The warning the engine gives without the MovieLens files, which the
 * MovieLens row says itself. */
const NO_MOVIELENS = /ml-32m/

function Running({
  job,
  focus,
}: {
  job: Extract<EvaluationJob, { state: 'running' }>
  focus: boolean
}) {
  // Just after Avaliar the page lands here: the status takes the focus, so
  // a screen reader says it and the keyboard goes on from it.
  const status = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focus) status.current?.focus()
  }, [focus])
  return (
    <div className="flex flex-col gap-sm rounded-field bg-surface-2 p-lg">
      <div
        ref={status}
        tabIndex={-1}
        aria-live="polite"
        className="flex justify-between gap-lg font-semibold"
      >
        <p>{job.message || COPY.running}</p>
        <p className="tabular-nums">{Math.floor(job.progress)}%</p>
      </div>
      <progress
        aria-label={COPY.progress}
        max={100}
        value={job.progress}
        className="h-2.5 w-full appearance-none overflow-hidden rounded-pill bg-surface [&::-moz-progress-bar]:bg-ink [&::-webkit-progress-bar]:bg-surface [&::-webkit-progress-value]:bg-ink"
      />
      <div className="flex flex-wrap items-center justify-between gap-sm text-meta text-ink-2">
        <p>{COPY.startedBy(job.by, job.startedAt, job.grid)}</p>
        <a
          href="/operacoes#avaliar"
          className="inline-flex min-h-touch items-center text-ink underline underline-offset-3"
        >
          {COPY.refresh}
        </a>
      </div>
    </div>
  )
}

const TABLE =
  'w-full text-left text-meta tabular-nums [&_td]:py-xs [&_td]:pr-md [&_th]:py-xs [&_th]:pr-md'

const CAPTION = 'pb-xs text-left font-display text-label text-ink-2 uppercase'

function Measures({ result }: { result: EvaluationSummary }) {
  const noMovielens = result.warnings.some((w) => NO_MOVIELENS.test(w))
  const samples = [
    [COPY.people, result.offline.people, COPY.noSample],
    [
      COPY.movielens,
      result.offline.movielens,
      noMovielens ? COPY.noMovielens : COPY.noSample,
    ],
  ] as const
  return (
    <div className="flex flex-col gap-xs">
      <table className={TABLE}>
        <caption className={CAPTION}>{COPY.measures}</caption>
        <thead>
          <tr className="border-b border-rule font-display">
            <th scope="col">{COPY.sample}</th>
            <th scope="col">{COPY.measured}</th>
            <th scope="col">{COPY.recall}</th>
            <th scope="col">{COPY.coverage}</th>
          </tr>
        </thead>
        <tbody>
          {samples.map(([name, m, empty]) => (
            <tr key={name} className="border-b border-rule">
              <th scope="row">{name}</th>
              <td>{m.people}</td>
              {m.people === 0 ? (
                <td colSpan={2} className="text-ink-2">
                  {empty}
                </td>
              ) : (
                <>
                  <td>{OPERATIONS.percent(m.recall50)}</td>
                  <td>{OPERATIONS.percent(m.coverageTop5)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-meta text-ink-2">{COPY.legend}</p>
    </div>
  )
}

function BestRow({ entry, rank }: { entry: GridBest; rank: number }) {
  const current = entry.changes.length === 0
  return (
    <tr className="border-b border-rule align-top">
      <th scope="row" className="whitespace-nowrap">
        {COPY.bestRow(rank)}
      </th>
      <td className="min-w-[16ch]">
        <span className="flex flex-col items-start gap-2xs">
          {current ? (
            <span className="text-ink-2">{COPY.current}</span>
          ) : (
            entry.changes.map((change) => (
              <span key={`${change.section}.${change.key}`}>
                {COPY.change(change)}
              </span>
            ))
          )}
          {(current || entry.tie) && (
            <span className="flex flex-wrap gap-xs">
              {current && <Tag>{COPY.currentTag}</Tag>}
              {entry.tie && <Tag>{COPY.tie}</Tag>}
            </span>
          )}
          {!current && (
            <CopyButton
              text={COPY.toml(entry.changes)}
              label={COPY.copyWeights}
              name={COPY.copyWeightsOf(rank)}
            />
          )}
        </span>
      </td>
      <td>{OPERATIONS.percent(entry.recall50)}</td>
      <td>{OPERATIONS.percent(entry.coverageTop5)}</td>
    </tr>
  )
}

/** A word in a pill, after a row's name: "atual", "empate". */
function Tag({ children }: { children: string }) {
  return (
    <span className="rounded-pill border border-rule px-sm font-display text-label text-ink-2 uppercase">
      {children}
    </span>
  )
}

function Best({ best }: { best: GridBest[] }) {
  return (
    <div className="flex flex-col gap-xs">
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <caption className={CAPTION}>{COPY.best}</caption>
          <thead>
            <tr className="border-b border-rule font-display">
              <th scope="col" aria-label={COPY.rank} />
              <th scope="col">{COPY.changes}</th>
              <th scope="col">{COPY.recall}</th>
              <th scope="col">{COPY.coverage}</th>
            </tr>
          </thead>
          <tbody>
            {best.map((entry, i) => (
              <BestRow key={COPY.bestRow(i + 1)} entry={entry} rank={i + 1} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-meta text-ink-2">{COPY.bestHint}</p>
    </div>
  )
}

/** What the run says, first: how much the list gets right, the change
 * since the report before, and whether to trust it. */
function Verdict({
  result,
  previous,
}: {
  result: EvaluationSummary
  previous: PreviousMeasure | null
}) {
  const { people } = result.offline
  const delta =
    previous && people.recall50 !== null && previous.date !== result.date
      ? COPY.delta(people.recall50, previous.recall50, previous.date)
      : null
  return (
    <div className="flex flex-col gap-xs">
      <p className="font-display text-step-title text-pretty">
        {COPY.verdict(people.recall50, people.people)}
        {delta && <span className="text-ink-2"> {delta}</span>}
      </p>
      <p className="text-ink-2">{COPY.priority(result.priority)}</p>
      {people.people < SMALL_SAMPLE && (
        <p className="flex items-start gap-sm text-meta">
          <Icon name="alert" className="mt-px size-[16px] shrink-0" />
          {COPY.smallSample}
        </p>
      )}
    </div>
  )
}

function Done({
  job,
  previous,
}: {
  job: Extract<EvaluationJob, { state: 'done' }>
  previous: PreviousMeasure | null
}) {
  const { result } = job
  const warnings = result.warnings.filter((w) => !NO_MOVIELENS.test(w))
  return (
    <div className="flex flex-col gap-xl">
      <p role="status" className="text-meta text-ink-2">
        {COPY.done(job.finishedAt)}
      </p>
      <Verdict result={result} previous={previous} />
      <div className="grid gap-2xl sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] sm:items-start">
        <Measures result={result} />
        <p className="text-meta">
          {COPY.online(result.online.sessions, result.online.rateTop5)}
        </p>
      </div>
      {warnings.length > 0 && (
        <ul className="list-disc space-y-xs pl-2xl text-meta text-ink-2">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
      {result.best && <Best best={result.best} />}
    </div>
  )
}

function Job({
  job,
  previous,
  focus,
}: {
  job: EvaluationJob
  previous: PreviousMeasure | null
  focus: boolean
}) {
  switch (job.state) {
    case 'running':
      return <Running job={job} focus={focus} />
    case 'done':
      return <Done job={job} previous={previous} />
    case 'failed':
      return (
        <Alert>
          {COPY.failed}
          <Detail>
            <code>{job.error.code}</code> ({job.error.message})
          </Detail>
        </Alert>
      )
    default:
      return null
  }
}

function RunForm() {
  return (
    <ActionPost
      action="avaliar"
      className="flex flex-wrap items-center gap-xl border-t border-rule pt-xl"
      submitClassName="sm:ml-auto"
    >
      <label className="flex min-h-touch cursor-pointer items-center gap-md">
        {/* Drawn, not the browser's: the native box looks disabled in the
            dark theme. A 2px ring, and an ink fill with the check when on. */}
        <span className="relative grid size-5 shrink-0 place-items-center">
          <input
            type="checkbox"
            name="grade"
            value="sim"
            aria-labelledby="avaliar-pesos"
            aria-describedby="avaliar-pesos-ajuda"
            className="peer size-5 cursor-pointer appearance-none rounded-note border-2 border-ink-2 bg-surface checked:border-ink checked:bg-ink"
          />
          <Icon
            name="check"
            className="pointer-events-none absolute size-4 text-surface opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span>
          <span id="avaliar-pesos" className="block font-semibold">
            {COPY.grid}
          </span>
          <span id="avaliar-pesos-ajuda" className="block text-meta text-ink-2">
            {COPY.gridHint}
          </span>
        </span>
      </label>
    </ActionPost>
  )
}

/** `evaluate` with its live progress: while a run goes on, the panel asks
 * `read` again every `pollMs`; it stops when the run ends. Without
 * JavaScript, "Atualizar" reloads the page. `started`: the page came back
 * from Avaliar, and the progress takes the focus. */
export function EvaluationSection({
  initial,
  read,
  pollMs = POLL_MS,
  started = false,
}: {
  initial: EvaluationPanel
  read: () => Promise<EvaluationPanel>
  pollMs?: number
  started?: boolean
}) {
  const [panel, setPanel] = useState(initial)
  const running = panel.job.state === 'running'
  // Each answer is a new job object, so the next ask follows it.
  const { job } = panel
  useEffect(() => {
    if (job.state !== 'running') return undefined
    let live = true
    const timer = setTimeout(() => {
      void read().then((next) => {
        if (live) setPanel(next)
      })
    }, pollMs)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [job, read, pollMs])

  return (
    <Section id="avaliar" title={COPY.title} lead={COPY.lead}>
      {panel.folder === 'unset' && (
        <Alert>
          {OPERATIONS.refusals['sem-pasta']}
          <Detail>
            <code>{COPY.folderSetting}</code>
          </Detail>
        </Alert>
      )}
      {panel.folder === 'unavailable' && <Alert>{COPY.unavailable}</Alert>}
      <Job job={panel.job} previous={panel.previous} focus={started} />
      {panel.folder === 'ready' && !running && (
        <>
          <Report report={panel.report} />
          <RunForm />
        </>
      )}
    </Section>
  )
}
