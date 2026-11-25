import { FIELD } from './kit/field'
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
import { FieldLabel } from './kit/field-label'
import { PageHead } from './kit/page-head'
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
        <table className="min-w-full text-left text-meta tabular-nums">
          <thead className="sticky top-0 bg-surface-2 font-display font-bold">
            <tr>
              {answer.columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className="px-md py-xs whitespace-nowrap"
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
                  <td key={cell.key} className="px-md py-xs align-top">
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
      <form method="get" action="/operacoes" className="flex flex-col gap-xl">
        <FieldLabel label={COPY.label}>
          <textarea
            name="sql"
            required
            rows={4}
            spellCheck={false}
            defaultValue={answer?.sql}
            placeholder={COPY.placeholder}
            className={`${FIELD} font-mono text-[14px] leading-[1.45]`}
          />
        </FieldLabel>
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
    <main className="mx-auto flex max-w-[720px] flex-col gap-3xl px-2xl py-3xl">
      <header className="flex flex-wrap items-center justify-between gap-xl">
        <LinkButton href="/">{OPERATIONS.back}</LinkButton>
      </header>
      <PageHead title={OPERATIONS.title} lead={OPERATIONS.lead} />
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
