import { createFileRoute } from '@tanstack/react-router'
import { isExportRefusal } from '#/content/export-refusal'
import { readExportChoices } from '#/content/export'
import { Export } from '#/ui/export'

export const Route = createFileRoute('/_owner/exportar')({
  validateSearch: (search) => ({
    erro: isExportRefusal(search.erro) ? search.erro : undefined,
  }),
  loader: () => readExportChoices(),
  component: ExportPage,
})

function ExportPage() {
  const { erro } = Route.useSearch()
  return <Export choices={Route.useLoaderData()} refusal={erro} />
}
