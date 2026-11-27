import { createFileRoute, notFound } from '@tanstack/react-router'
import { readEvaluationPanel, readOperationsPage } from '#/content/operations'
import {
  consultSql,
  isOperationsNotice,
  isOperationsRefusal,
} from '#/content/operations-form'
import { Operations } from '#/ui/operations'
import { PAGE_TITLES, titled } from '#/ui/page-title'

// Only an admin Dono: for anyone else the page does not exist. The server
// functions refuse a non-admin on their own.
export const Route = createFileRoute('/_owner/operacoes')({
  validateSearch: (search) => ({
    sql: consultSql(search.sql),
    feito: isOperationsNotice(search.feito) ? search.feito : undefined,
    erro: isOperationsRefusal(search.erro) ? search.erro : undefined,
  }),
  loaderDeps: ({ search }) => ({ sql: search.sql }),
  beforeLoad: ({ context }) => {
    if (!context.owner.admin) throw notFound()
  },
  // A post loads the page again itself, once (`useFetchForm`), the shell's
  // strip of a failing push with it.
  loader: ({ deps }) => readOperationsPage({ data: deps }),
  head: () => titled(PAGE_TITLES.operations),
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
