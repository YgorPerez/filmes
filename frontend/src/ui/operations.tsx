import type { ConsultValue } from '@filmes/engine'
import type {
  OperationsNotice,
  OperationsRefusal,
} from '#/content/operations-form'
import type {
  ConsultAnswer,
  EvaluationPanel,
  OperationsPage,
} from '#/platform/operations'
import { Marquee } from './marquee'
import { EvaluationSection, jobKey } from './operations-evaluation'
import { OPERATIONS } from './operations.copy'
import { PushSection } from './operations-push'
import { Alert, LinkButton, Notice, Section, Submit } from './person-parts'

const COPY = OPERATIONS.consult

function Cell({ value }: { value: ConsultValue }) {
  if (value === null) return <span className="text-ink-2">{COPY.null}</span>
  return <>{String(value)}</>
}

/** The console's answer: the table, or the engine's refusal with its
 * code. */
function ConsultResult({ answer }: { answer: ConsultAnswer }) {
  if ('error' in answer) {
    const { code, message } = answer.error
    const known = COPY.errors[code]
    return (
      <Alert>
        {known ?? COPY.other} <code>{code}</code>
        {known !== undefined && <> · {message}</>}
      </Alert>
    )
  }
  if (answer.total === 0) return <p className="text-ink-2">{COPY.empty}</p>
  return (
    <div className="flex flex-col gap-xs">
      <p role="status" className="text-meta text-ink-2">
        {COPY.rows(answer.total, answer.rows.length)}
      </p>
      <div className="max-h-[60vh] overflow-auto rounded-field border border-rule">
        <table className="min-w-full text-left text-meta">
          <thead className="sticky top-0 bg-surface-2">
            <tr>
              {answer.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-2 py-1 whitespace-nowrap"
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {answer.rows.map((row) => (
              <tr key={row.key} className="border-t border-rule">
                {row.cells.map((cell) => (
                  <td key={cell.key} className="px-2 py-1 align-top">
                    <Cell value={cell.value} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The read-only SQL console: a plain GET of this page, so the query is in
 * the address and works before the JavaScript loads. */
function ConsultSection({ answer }: { answer: ConsultAnswer | null }) {
  return (
    <Section id="consultar" title={COPY.title} lead={COPY.lead}>
      <form method="get" action="/operacoes" className="flex flex-col gap-md">
        <label className="flex flex-col gap-xs">
          <span className="text-[14px] font-semibold">{COPY.label}</span>
          <textarea
            name="sql"
            required
            rows={4}
            spellCheck={false}
            defaultValue={answer?.sql}
            placeholder={COPY.placeholder}
            className="rounded-field border border-rule bg-surface px-3 py-[9px] text-[15px] text-ink"
          />
        </label>
        <Submit>{COPY.run}</Submit>
      </form>
      {answer && <ConsultResult answer={answer} />}
    </Section>
  )
}

/** `/operacoes`, for an admin: the push of filmes-dados, `evaluate` with
 * its progress, and the console. */
export function Operations({
  page,
  notice,
  refusal,
  readEvaluation,
}: {
  page: OperationsPage
  notice?: OperationsNotice
  refusal?: OperationsRefusal
  readEvaluation: () => Promise<EvaluationPanel>
}) {
  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-xl px-lg py-xl">
      <header className="flex flex-wrap items-center justify-between gap-md">
        <Marquee words={['filmes']} />
        <LinkButton href="/">{OPERATIONS.back}</LinkButton>
      </header>
      <div className="flex flex-col gap-xs">
        <h1 className="text-title">{OPERATIONS.title}</h1>
        <p className="text-ink-2">{OPERATIONS.lead}</p>
      </div>
      {notice && <Notice>{OPERATIONS.notices[notice]}</Notice>}
      {refusal && <Alert>{OPERATIONS.refusals[refusal]}</Alert>}
      <EvaluationSection
        key={jobKey(page.evaluation.job)}
        initial={page.evaluation}
        read={readEvaluation}
      />
      <ConsultSection answer={page.consult} />
      <PushSection status={page.push} />
    </main>
  )
}
