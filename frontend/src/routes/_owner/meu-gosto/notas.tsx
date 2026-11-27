import { createFileRoute } from '@tanstack/react-router'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isRatingRefusal, writtenCount } from '#/content/rating-form'
import { readRatingQueue } from '#/content/ratings'
import { RatingScreen } from '#/ui/imports'
import { PAGE_TITLES, titled } from '#/ui/page-title'

export const Route = createFileRoute('/_owner/meu-gosto/notas')({
  validateSearch: (search) => ({
    feito: writtenCount(search.feito),
    erro: isRatingRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    filme: filmParam(search.filme),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  loader: async ({ deps }) => {
    const [queue, search] = await Promise.all([
      readRatingQueue(),
      searchFor(deps.buscar, 'films'),
    ])
    return { queue, search }
  },
  head: () => titled(PAGE_TITLES.rate),
  component: RatingRoute,
})

function RatingRoute() {
  const { feito, erro, filme } = Route.useSearch()
  const { queue, search } = Route.useLoaderData()
  return (
    <RatingScreen
      queue={queue}
      search={search}
      film={filme}
      written={feito}
      refusal={erro}
    />
  )
}
