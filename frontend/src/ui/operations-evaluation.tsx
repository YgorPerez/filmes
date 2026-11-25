import { useEffect, useState } from 'react'
import type {
  EvaluationJob,
  EvaluationPanel,
  EvaluationReport,
  EvaluationSummary,
} from '#/platform/operations'
import { OPERATIONS } from './operations.copy'
import { ActionPost } from './operations-parts'
import { Alert, Section, Submit } from './person-parts'

const COPY = OPERATIONS.evaluation

/** How often the page asks for the progress while a run goes on. */
const POLL_MS = 1000

function Running({
  job,
}: {
  job: Extract<EvaluationJob, { state: 'running' }>
}) {
  return (
    <div className="flex flex-col gap-xs" aria-live="polite">
      <progress
        aria-label={COPY.progress}
        max={100}
        value={job.progress}
        className="h-2.5 w-full appearance-none overflow-hidden rounded-pill bg-surface-2 [&::-moz-progress-bar]:bg-ink [&::-webkit-progress-bar]:bg-surface-2 [&::-webkit-progress-value]:bg-ink"
      />
      <p className="tabular-nums">
        {Math.floor(job.progress)}% · {job.message || COPY.running}
      </p>
      <p className="text-meta text-ink-2">
        {COPY.startedBy(job.by, job.startedAt, job.grid)}{' '}
        <a href="/operacoes" className="text-ink underline underline-offset-3">
          {COPY.refresh}
        </a>
      </p>
    </div>
  )
}

function Measures({ result }: { result: EvaluationSummary }) {
  const samples = [
    [COPY.people, result.offline.people],
    [COPY.movielens, result.offline.movielens],
  ] as const
  return (
    <table className="w-full text-left text-meta tabular-nums [&_td]:py-xs [&_td]:pr-md [&_th]:py-xs [&_th]:pr-md">
      <caption className="pb-xs text-left font-display text-label text-ink-2 uppercase">
        {COPY.measures}
      </caption>
      <thead>
        <tr className="border-b border-rule font-display">
          <th scope="col">{COPY.sample}</th>
          <th scope="col">{COPY.measured}</th>
          <th scope="col">{COPY.recall}</th>
          <th scope="col">{COPY.coverage}</th>
        </tr>
      </thead>
      <tbody>
        {samples.map(([name, m]) => (
          <tr key={name} className="border-b border-rule">
            <th scope="row">{name}</th>
            <td>{m.people}</td>
            <td>{OPERATIONS.percent(m.recall50)}</td>
            <td>{OPERATIONS.percent(m.coverageTop5)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Best({ best }: { best: NonNullable<EvaluationSummary['best']> }) {
  return (
    <table className="w-full text-left text-meta tabular-nums [&_td]:py-xs [&_td]:pr-md [&_th]:py-xs [&_th]:pr-md">
      <caption className="pb-xs text-left font-display text-label text-ink-2 uppercase">
        {COPY.best}
      </caption>
      <thead>
        <tr className="border-b border-rule">
          <th scope="col" aria-label="Posição" />
          <th scope="col">{COPY.recall}</th>
          <th scope="col">{COPY.coverage}</th>
        </tr>
      </thead>
      <tbody>
        {best.map((entry, i) => (
          <tr key={COPY.bestRow(i + 1)} className="border-b border-rule">
            <th scope="row">{COPY.bestRow(i + 1)}</th>
            <td>{OPERATIONS.percent(entry.recall50)}</td>
            <td>{OPERATIONS.percent(entry.coverageTop5)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Done({ job }: { job: Extract<EvaluationJob, { state: 'done' }> }) {
  const { result } = job
  return (
    <div className="flex flex-col gap-xl">
      <p role="status">
        {COPY.done(job.finishedAt)} {COPY.file(result.file)}
      </p>
      <Measures result={result} />
      <p>{COPY.online(result.online.sessions, result.online.rateTop5)}</p>
      <p className="text-ink-2">{COPY.priority(result.priority)}</p>
      {result.warnings.map((warning) => (
        <p key={warning} className="text-meta text-ink-2">
          {warning}
        </p>
      ))}
      {result.best && <Best best={result.best} />}
    </div>
  )
}

function Job({ job }: { job: EvaluationJob }) {
  switch (job.state) {
    case 'running':
      return <Running job={job} />
    case 'done':
      return <Done job={job} />
    case 'failed':
      return <Alert>{COPY.failed(job.error.code, job.error.message)}</Alert>
    default:
      return null
  }
}

function Report({ report }: { report: EvaluationReport | null }) {
  if (report === null) return <p className="text-ink-2">{COPY.noReport}</p>
  return (
    <details className="rounded-field border border-rule">
      <summary className="min-h-touch cursor-pointer content-center px-lg font-display text-[14px] font-bold">
        {COPY.report(report.date)}
      </summary>
      <pre className="overflow-x-auto border-t border-rule p-sm text-meta whitespace-pre-wrap">
        {report.text}
      </pre>
    </details>
  )
}

function RunForm({ running }: { running: boolean }) {
  return (
    <ActionPost action="avaliar" className="flex flex-col gap-xl">
      <label className="flex min-h-touch cursor-pointer items-center gap-md rounded-field bg-surface-2 px-lg py-sm">
        <input
          type="checkbox"
          name="grade"
          value="sim"
          className="size-5 shrink-0 accent-ink"
        />
        <span>
          {COPY.grid} <span className="text-ink-2">({COPY.gridHint})</span>
        </span>
      </label>
      <Submit variant="primary" disabled={running}>
        {running ? COPY.running : COPY.run}
      </Submit>
    </ActionPost>
  )
}

/** `evaluate` with its live progress: while a run goes on, the panel asks
 * `read` again every `pollMs`; it stops when the run ends. Without
 * JavaScript, "Atualizar" reloads the page. */
export function EvaluationSection({
  initial,
  read,
  pollMs = POLL_MS,
}: {
  initial: EvaluationPanel
  read: () => Promise<EvaluationPanel>
  pollMs?: number
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
      {panel.folder === 'unset' && <Alert>{COPY.unset}</Alert>}
      {panel.folder === 'unavailable' && <Alert>{COPY.unavailable}</Alert>}
      {panel.folder === 'ready' && <RunForm running={running} />}
      <Job job={panel.job} />
      {panel.folder === 'ready' && <Report report={panel.report} />}
    </Section>
  )
}

/** A key that changes with each run, so a page loaded after a new run
 * starts from the loader's panel. */
export const jobKey = (job: EvaluationJob) =>
  job.state === 'idle' ? 'idle' : job.startedAt
