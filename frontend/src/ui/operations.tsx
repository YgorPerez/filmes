import type {
  OperationsNotice,
  OperationsRefusal,
} from '#/content/operations-form'
import type { EvaluationPanel, OperationsPage } from '#/platform/operations'
import { PageHead } from './kit/page-head'
import { jobKey } from './evaluation-job'
import { ConsultSection } from './operations-console'
import { EvaluationSection } from './operations-evaluation'
import { OPERATIONS } from './operations.copy'
import { Alert } from './operations-parts'
import { PushSection } from './operations-push'

/** `/operacoes`, for an admin: the push of filmes-dados, `evaluate` with
 * its progress, and the console. While pushes fail, the push comes first,
 * across the column: it is what needs doing. */
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
  const showRefusal =
    refusal && (refusal !== 'sem-pasta' || page.evaluation.folder !== 'unset')
  const failing = (page.push?.failures ?? 0) > 0
  const push = <PushSection status={page.push} retried={notice === 'enviado'} />
  return (
    <main className="mx-auto flex max-w-[1040px] flex-col gap-3xl px-2xl py-3xl">
      <PageHead title={OPERATIONS.title} />
      {showRefusal && <Alert>{OPERATIONS.refusals[refusal]}</Alert>}
      {failing && push}
      <div
        className={`grid grid-cols-1 gap-3xl ${failing ? '' : 'min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] min-[900px]:items-start'}`}
      >
        <ConsultSection
          answer={page.consult}
          schema={page.schema}
          quiet={failing}
        />
        {!failing && (
          // Beside a long console, the push stays in view.
          <div className="min-[900px]:sticky min-[900px]:top-xl">{push}</div>
        )}
      </div>
      <EvaluationSection
        key={jobKey(page.evaluation.job)}
        initial={page.evaluation}
        read={readEvaluation}
        started={notice === 'avaliando'}
      />
    </main>
  )
}
