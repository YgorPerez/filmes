import { useEffect, useState } from 'react'
import type {
  EvaluationJob,
  EvaluationPanel,
  EvaluationReport,
  EvaluationSummary,
} from '#/platform/operations'
import { OPERATIONS } from './operations.copy'
import { ActionPost, Alert, Detail, Section } from './operations-parts'

const COPY = OPERATIONS.evaluation

/** How often the page asks for the progress while a run goes on. */
const POLL_MS = 1000

function Running({
  job,
}: {
  job: Extract<EvaluationJob, { state: 'running' }>
}) {
  return (
    <div className="flex flex-col gap-sm rounded-field bg-surface-2 p-lg">
      <div
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
          <th scope="col" aria-label={COPY.rank} />
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
      <div className="grid gap-2xl sm:grid-cols-2 sm:items-start">
        <Measures result={result} />
        <div className="flex flex-col gap-xs text-evidence">
          <p>{COPY.online(result.online.sessions, result.online.rateTop5)}</p>
          <p className="text-ink-2">{COPY.priority(result.priority)}</p>
        </div>
      </div>
      {result.warnings.length > 0 && (
        <ul className="list-disc space-y-xs pl-2xl text-meta text-ink-2">
          {result.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
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

function Report({ report }: { report: EvaluationReport | null }) {
  if (report === null) return <p className="text-ink-2">{COPY.noReport}</p>
  return (
    <details className="rounded-field border border-rule">
      <summary className="min-h-touch cursor-pointer content-center px-lg font-display text-field-label">
        {COPY.report(report.date)}
      </summary>
      <pre className="overflow-x-auto border-t border-rule p-sm text-meta whitespace-pre-wrap">
        {report.text}
      </pre>
    </details>
  )
}

function RunForm() {
  return (
    <ActionPost
      action="avaliar"
      className="flex flex-wrap items-center gap-xl border-t border-rule pt-xl"
      submitClassName="sm:ml-auto"
    >
      <label className="flex min-h-touch cursor-pointer items-center gap-md">
        <input
          type="checkbox"
          name="grade"
          value="sim"
          aria-labelledby="avaliar-pesos"
          aria-describedby="avaliar-pesos-ajuda"
          className="size-5 shrink-0 accent-ink"
        />
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
      {panel.folder === 'unset' && (
        <Alert>
          {OPERATIONS.refusals['sem-pasta']}
          <Detail>
            <code>{COPY.folderSetting}</code>
          </Detail>
        </Alert>
      )}
      {panel.folder === 'unavailable' && <Alert>{COPY.unavailable}</Alert>}
      <Job job={panel.job} />
      {panel.folder === 'ready' && (
        <>
          <Report report={panel.report} />
          {!running && <RunForm />}
        </>
      )}
    </Section>
  )
}
