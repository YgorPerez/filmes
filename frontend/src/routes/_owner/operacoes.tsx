import { createFileRoute, notFound } from '@tanstack/react-router'
import { readEvaluationPanel, readOperationsPage } from '#/content/operations'
import {
  consultSql,
  isOperationsNotice,
  isOperationsRefusal,
} from '#/content/operations-form'
import { Operations } from '#/ui/operations'

// Only an admin Dono: for anyone else the page does not exist. The server
// functions refuse a non-admin on their own.
export const Route = createFileRoute('/_owner/operacoes')({
  validateSearch: (search) => ({
    sql: consultSql(search.sql),
    feito: isOperationsNotice(search.feito) ? search.feito : undefined,
    erro: isOperationsRefusal(search.erro) ? search.erro : undefined,
  }),
  loaderDeps: ({ search }) => ({ sql: search.sql }),
  // The POST may change the evaluation or queue while the SQL stays the same.
  shouldReload: true,
  beforeLoad: ({ context }) => {
    if (!context.owner.admin) throw notFound()
  },
  loader: {
    handler: ({ deps }) => readOperationsPage({ data: deps }),
    staleReloadMode: 'blocking',
  },
  component: OperationsPage,
})

function OperationsPage() {
  const { feito, erro } = Route.useSearch()
  return (
    <Operations
      page={Route.useLoaderData()}
      notice={feito}
      refusal={erro}
      readEvaluation={readEvaluationPanel}
    />
  )
}
